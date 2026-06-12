import argparse
import json
import os
import sys
import time
from collections import deque

from stopper import DarkForestStopper
from utils import ObsFlatten, MaskSanitize

import numpy as np
import torch
import torch.nn as nn
from tensordict import TensorDict
from tensordict.nn import TensorDictModule, TensorDictSequential

try:  # torchrl >= 0.10 renamed SyncDataCollector -> Collector
    from torchrl.collectors import Collector as SyncDataCollector
except ImportError:
    from torchrl.collectors import SyncDataCollector
from torchrl.envs import RewardSum, StepCounter, TransformedEnv
from torchrl.envs.batched_envs import ParallelEnv
from torchrl.envs.libs.pettingzoo import PettingZooWrapper
from torchrl.envs.utils import ExplorationType, MarlGroupMapType, set_exploration_type
from torchrl.modules import MaskedCategorical, MultiAgentMLP, ProbabilisticActor
from torchrl.objectives.value import GAE

from config import get_config, seed_everything
from rewards import *

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import (  # noqa: E402
    DarkForestParallelEnv,
    A_EXPLORE,
    A_BROADCAST,
    N_NONTARGETED,
)

def make_base_env(args):
    return DarkForestParallelEnv(
        names=args.names, width=args.width, height=args.height,
        initial_planets=args.initial_planets, max_steps=args.max_steps,
        harvest_rate=args.harvest_rate,
        initial_resources=args.initial_resources,
        initial_population=args.initial_population,
        reward_weights=args.reward_weights or None,
    )

def make_torchrl_env(args, device):
    def maker():
        wrapped = PettingZooWrapper(
            make_base_env(args),
            group_map=MarlGroupMapType.ALL_IN_ONE_GROUP,
            use_mask=True,              # exposes (GROUP, "mask"): agent alive?
            categorical_actions=True,
            device=device,
        )
        return wrapped

    env = ParallelEnv(args.num_envs, maker, device=device)
    env = TransformedEnv(
        env,
        RewardSum(
            in_keys=[(GROUP, "reward")],
            out_keys=[(GROUP, "episode_reward")],
        ),
    )
    env.append_transform(StepCounter())
    return env

def build_models(args, env, device):
    obs_spec = env.observation_spec[GROUP, "observation"]
    c, h, w = obs_spec["map"].shape[-3:]
    self_dim = obs_spec["self"].shape[-1]
    obs_dim = c * h * w + self_dim
    n_agents = obs_spec["map"].shape[-4]
    action_dim = env.full_action_spec[GROUP, "action"].space.n

    features = TensorDictModule(
        ObsFlatten(),
        in_keys=[(GROUP, "observation", "map"), (GROUP, "observation", "self")],
        out_keys=[(GROUP, "obs_flat")],
    )
    sanitize = TensorDictModule(
        MaskSanitize(),
        in_keys=[(GROUP, "action_mask")],
        out_keys=[(GROUP, "valid_mask")],
    )

    actor_net = TensorDictModule(
        MultiAgentMLP(
            n_agent_inputs=obs_dim,
            n_agent_outputs=action_dim,
            n_agents=n_agents,
            centralised=False,
            share_params=True,
            device=device,
            depth=2,
            num_cells=args.hidden_dim,
            activation_class=nn.Tanh,
        ),
        in_keys=[(GROUP, "obs_flat")],
        out_keys=[(GROUP, "logits")],
    )
    policy = ProbabilisticActor(
        module=TensorDictSequential(features, sanitize, actor_net),
        spec=env.full_action_spec[GROUP, "action"],
        in_keys={"logits": (GROUP, "logits"), "mask": (GROUP, "valid_mask")},
        out_keys=[(GROUP, "action")],
        distribution_class=MaskedCategorical,
        return_log_prob=True,
        log_prob_key=(GROUP, "sample_log_prob"),
    )

    critic_net = TensorDictModule(
        MultiAgentMLP(
            n_agent_inputs=obs_dim,
            n_agent_outputs=1,
            n_agents=n_agents,
            centralised=(args.critic == "centralized"),  # MAPPO vs IPPO
            share_params=True,
            device=device,
            depth=2,
            num_cells=args.hidden_dim,
            activation_class=nn.Tanh,
        ),
        in_keys=[(GROUP, "obs_flat")],
        out_keys=[(GROUP, "state_value")],
    )
    critic = TensorDictSequential(features, critic_net)
    return policy, critic, obs_dim, action_dim, n_agents

# --------------------------------------------------------------------------- #
# render recording: expose planets / civilizations / actions per step
# --------------------------------------------------------------------------- #
ACTION_TYPE_NAMES = ("colonize_empty", "destroy_planet", "colonize_inhabited")


def decode_action(env: DarkForestParallelEnv, action: int):
    """Turn a flat action index into a renderable description."""
    if action == A_EXPLORE:
        return {"id": int(action), "type": "explore", "target": None}
    if action == A_BROADCAST:
        return {"id": int(action), "type": "broadcast", "target": None}
    t = action - N_NONTARGETED
    ttype, cidx = divmod(t, env.n_cells)
    coord = (cidx // env.width, cidx % env.width)
    return {"id": int(action),
            "type": ACTION_TYPE_NAMES[int(ttype)],
            "target": [int(coord[0]), int(coord[1])]}

def snapshot_planets(env: DarkForestParallelEnv):
    return [
        {
            "coord": [int(p.coord[0]), int(p.coord[1])],
            "resources": float(p.resources),
            "owner": p.civilization.name if p.civilization is not None else None,
            "destroyed": bool(p.destroyed),
        }
        for p in env.planets
    ]


def _civs_killed_this_step(
    env: DarkForestParallelEnv,
    acting: dict[str, int],
    alive_before: set,
) -> set:
    coord_to_name: dict = {
        (env.civs[n].coord[0], env.civs[n].coord[1]): n
        for n in env.possible_agents
    }

    attacked_coords: set = set()
    for actor, action in acting.items():
        decoded = decode_action(env, action)
        if decoded["type"] == "colonize_inhabited" and decoded["target"] is not None:
            attacked_coords.add((decoded["target"][0], decoded["target"][1]))

    killed: set = set()
    for name in env.possible_agents:
        civ = env.civs[name]
        if (
            name in alive_before
            and not civ.alive
            and (civ.coord[0], civ.coord[1]) in attacked_coords
        ):
            killed.add(name)
    return killed


def snapshot_civilizations(
    env: DarkForestParallelEnv,
    killed_this_step: set | None = None,
):
    if killed_this_step is None:
        killed_this_step = set()
    out = []
    for name in env.possible_agents:
        civ = env.civs[name]
        out.append({
            "name": name,
            "alive": bool(civ.alive),
            "killed": name in killed_this_step,
            "home_coord": [int(civ.coord[0]), int(civ.coord[1])],
            "population": float(civ.population),
            "science": float(civ.science),
            "resources": float(civ.resources),
            "birth_rate": float(civ.birth_rate),
            "death_rate": float(civ.death_rate),
            "population_consumption": float(civ.population_consumption),
            "harvest_rate": float(civ.harvest_rate),
            "strength": float(civ.strength),
            "exploration_radius": int(civ.exploration_radius),
            "owned_planets": [[int(p.coord[0]), int(p.coord[1])]
                              for p in env.planets if p.civilization is civ],
            "known_civilizations": [c.name for c in civ.known_civilizations],
            "explored_cells": sorted([int(r), int(c)]
                                     for (r, c) in civ.explored_cells),
        })
    return out

def _policy_actions(policy, env, obs, device, deterministic, action_dim):
    """Run the trained policy on raw PettingZoo observations."""
    names = env.possible_agents
    n = len(names)
    c_, h_, w_ = next(iter(obs.values()))["map"].shape if obs else (0, 0, 0)
    maps = torch.zeros((n, c_, h_, w_), dtype=torch.float32)
    selfs = torch.zeros((n, 8), dtype=torch.float32)
    masks = torch.zeros((n, action_dim), dtype=torch.bool)
    masks[:, A_EXPLORE] = True  # placeholder for dead agents
    for i, name in enumerate(names):
        o = obs.get(name)
        if o is None:
            continue
        maps[i] = torch.as_tensor(o["map"])
        selfs[i] = torch.as_tensor(o["self"])
        masks[i] = torch.as_tensor(o["action_mask"]).bool()
    td = TensorDict(
        {GROUP: TensorDict(
            {"observation": TensorDict({"map": maps, "self": selfs}, [n]),
             "action_mask": masks},
            batch_size=[n])},
        batch_size=[],
    ).to(device)
    mode = (ExplorationType.DETERMINISTIC if deterministic
            else ExplorationType.RANDOM)
    with torch.no_grad(), set_exploration_type(mode):
        td = policy(td)
    acts = td[GROUP, "action"].cpu().numpy()
    return {name: int(acts[i]) for i, name in enumerate(names)}

def record_episode(policy, args, device, action_dim, out_path,
                   seed=None, deterministic=False):
    env = make_base_env(args)
    obs, _ = env.reset(seed=seed)

    frames = [{
        "step": 0,
        "actions": {},
        "rewards": {},
        "planets": snapshot_planets(env),
        "civilizations": snapshot_civilizations(env),
    }]
    step = 0
    total_killed = 0

    while env.agents:
        alive_before = {n for n in env.possible_agents if env.civs[n].alive}
        all_actions = _policy_actions(policy, env, obs, device,
                                      deterministic, action_dim)
        acting = {n: all_actions[n] for n in env.agents}
        obs, rewards, terms, truncs, _ = env.step(acting)
        step += 1

        killed = _civs_killed_this_step(env, acting, alive_before)
        total_killed += len(killed)

        frames.append({
            "step": step,
            "actions": {n: decode_action(env, a) for n, a in acting.items()},
            "rewards": {n: float(r) for n, r in rewards.items()},
            "terminations": {n: bool(t) for n, t in terms.items()},
            "truncations": {n: bool(t) for n, t in truncs.items()},
            "killed": sorted(killed),
            "planets": snapshot_planets(env),
            "civilizations": snapshot_civilizations(env, killed_this_step=killed),
        })

    survivors = sum(1 for c in env.civs.values() if c.alive)
    data = {
        "meta": {
            "width": env.width,
            "height": env.height,
            "names": list(env.possible_agents),
            "max_steps": env.max_steps,
            "episode_length": step,
            "survivors": survivors,
            "annihilation": survivors <= 1,
            "total_killed": total_killed,
            "seed": seed,
            "deterministic": deterministic,
        },
        "frames": frames,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(data, f)
    env.close()
    return data["meta"]

def record_episode_stream(policy, args, device, action_dim,
                          on_step, seed=None, deterministic=False):
    env = make_base_env(args)
    obs, _ = env.reset(seed=seed)

    on_step({
        "step": 0,
        "actions": {},
        "rewards": {},
        "terminations": {},
        "truncations": {},
        "killed": [],
        "planets": snapshot_planets(env),
        "civilizations": snapshot_civilizations(env),
        "episode_done": False,
    })

    step = 0
    total_killed = 0

    while env.agents:
        alive_before = {n for n in env.possible_agents if env.civs[n].alive}
        all_actions = _policy_actions(policy, env, obs, device,
                                      deterministic, action_dim)
        acting = {n: all_actions[n] for n in env.agents}
        obs, rewards, terms, truncs, _ = env.step(acting)
        step += 1

        killed = _civs_killed_this_step(env, acting, alive_before)
        total_killed += len(killed)

        on_step({
            "step": step,
            "actions": {n: decode_action(env, a) for n, a in acting.items()},
            "rewards": {n: float(r) for n, r in rewards.items()},
            "terminations": {n: bool(t) for n, t in terms.items()},
            "truncations": {n: bool(t) for n, t in truncs.items()},
            "killed": sorted(killed),
            "planets": snapshot_planets(env),
            "civilizations": snapshot_civilizations(env, killed_this_step=killed),
            "episode_done": not env.agents,
        })

<<<<<<< HEAD
<<<<<<< Updated upstream
    survivors = int((next_pop[e, t] > 0).sum())
=======
=======
    # Count survivors from the env directly. `next_pop`/`e`/`t` were a
    # leftover reference to the training loop's scope and never existed here.
>>>>>>> 004e9f571e90ee785da2e8df60c8bc55ea48e7d7
    survivors = sum(
        1 for name in env.possible_agents
        if env.civs[name].alive and env.civs[name].population > 0
    )
<<<<<<< HEAD
>>>>>>> Stashed changes
=======
>>>>>>> 004e9f571e90ee785da2e8df60c8bc55ea48e7d7
    meta = {
        "width": env.width,
        "height": env.height,
        "names": list(env.possible_agents),
        "max_steps": env.max_steps,
        "episode_length": step,
        "survivors": survivors,
        "annihilation": survivors <= 1,
        "total_killed": total_killed,
        "seed": seed,
        "deterministic": deterministic,
    }
    env.close()
    return meta


def ppo_update(args, policy, critic, optimizer, data, minibatch_size):
    flat = data.reshape(-1)
    n_frames = flat.shape[0]
    last = {"pg_loss": float("nan"), "v_loss": float("nan"),
            "entropy": float("nan")}
    approx_kl = None

    for _ in range(args.update_epochs):
        perm = torch.randperm(n_frames, device=flat.device)
        for s in range(0, n_frames, minibatch_size):
            mb = flat[perm[s:s + minibatch_size]]
            live = mb.get((GROUP, "mask")).to(torch.float32)
            denom = live.sum().clamp_min(1.0)

            dist = policy.get_dist(mb)
            new_logp = dist.log_prob(mb.get((GROUP, "action")))
            entropy = dist.entropy()

            old_logp = mb.get((GROUP, "sample_log_prob"))
            if old_logp.dim() == new_logp.dim() + 1:
                old_logp = old_logp.squeeze(-1)
            logratio = new_logp - old_logp
            ratio = logratio.exp()

            adv = mb.get((GROUP, "advantage")).squeeze(-1)
            if args.norm_adv:
                lv = live.bool()
                if lv.sum() > 1:
                    adv = (adv - adv[lv].mean()) / (adv[lv].std() + 1e-8)

            pg1 = -adv * ratio
            pg2 = -adv * torch.clamp(ratio, 1 - args.clip_coef,
                                     1 + args.clip_coef)
            pg_loss = (torch.max(pg1, pg2) * live).sum() / denom

            old_val = mb.get((GROUP, "state_value")).squeeze(-1)
            ret = mb.get((GROUP, "value_target")).squeeze(-1)
            critic(mb)
            new_val = mb.get((GROUP, "state_value")).squeeze(-1)
            v_unclipped = (new_val - ret) ** 2
            v_clipped = (old_val + torch.clamp(new_val - old_val,
                                               -args.clip_coef,
                                               args.clip_coef) - ret) ** 2
            v_loss = 0.5 * (torch.max(v_unclipped, v_clipped) * live).sum() / denom

            ent_loss = (entropy * live).sum() / denom
            with torch.no_grad():
                approx_kl = float(
                    (((ratio - 1) - logratio) * live).sum() / denom)

            loss = pg_loss - args.ent_coef * ent_loss + args.vf_coef * v_loss
            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(
                list(policy.parameters()) + list(critic.parameters()),
                args.max_grad_norm)
            optimizer.step()

            last = {"pg_loss": float(pg_loss.detach()),
                    "v_loss": float(v_loss.detach()),
                    "entropy": float(ent_loss.detach())}
        if (args.target_kl is not None and approx_kl is not None
                and approx_kl > args.target_kl):
            break
    return last, approx_kl


def conquer_prob_mass(policy, data, n_cells, device):
    """Mean probability mass a live agent places on any colonize_inhabited action.

    colonize_inhabited actions occupy the third targeted band:
        indices in [N_NONTARGETED + 2*n_cells,  N_NONTARGETED + 3*n_cells)

    We run the policy in no_grad mode to get the full categorical distribution
    over the flat action space, then sum probabilities in that slice for each
    live agent and average across all live (env, step, agent) rows.

    Returns a float in [0, 1].
    """
    conquer_lo = N_NONTARGETED + 2 * n_cells
    conquer_hi = N_NONTARGETED + 3 * n_cells  # exclusive

    flat = data.reshape(-1)                              # [B, ...]
    live = flat.get((GROUP, "mask"))                     # [B, N]  bool
    denom = live.sum().item()
    if denom == 0:
        return 0.0

    with torch.no_grad():
        dist = policy.get_dist(flat)                     # MaskedCategorical over [B, N, A]
        # probs shape: [B, N, action_dim]
        probs = dist.probs                               # already masked & renormalised
        conquer_mass = probs[..., conquer_lo:conquer_hi].sum(dim=-1)  # [B, N]

    return float((conquer_mass * live.float()).sum() / denom)


def main():
    args = get_config()
    device = torch.device(args.device)

    run_dir = args.run_dir
    os.makedirs(run_dir, exist_ok=True)

    seed_everything(args)

    frames_per_batch = args.num_envs * args.num_steps
    num_iters = max(1, args.total_timesteps // frames_per_batch)
    minibatch_size = max(1, frames_per_batch // args.num_minibatches)

    env = make_torchrl_env(args, device)
    env.set_seed(args.seed)
    policy, critic, obs_dim, action_dim, n_agents = build_models(args, env, device)

    print(f"[setup] run={args.run_name} critic={args.critic} device={device} "
          f"n_agents={n_agents} obs_dim={obs_dim} action_dim={action_dim} "
          f"iters={num_iters} stop-mode={args.stop_mode}")

    collector = SyncDataCollector(
        env,
        policy,
        device=device,
        frames_per_batch=frames_per_batch,
        total_frames=num_iters * frames_per_batch,
    )

    gae = GAE(gamma=args.gamma, lmbda=args.gae_lambda,
              value_network=critic, average_gae=False)
    gae.set_keys(
        reward=(GROUP, "reward"),
        value=(GROUP, "state_value"),
        done=(GROUP, "done"),
        terminated=(GROUP, "terminated"),
        advantage=(GROUP, "advantage"),
        value_target=(GROUP, "value_target"),
    )

    optimizer = torch.optim.Adam(
        list(policy.parameters()) + list(critic.parameters()),
        lr=args.learning_rate, eps=1e-5)

    stopper = DarkForestStopper(args)
    return_hist = deque(maxlen=100)
    surv_hist = deque(maxlen=100)
    global_step = 0
    start = time.time()
    stop_reason = None

    # Death-cause accumulators (reset each print window)
    death_starved_acc = 0
    death_conquered_acc = 0
    death_planet_destroyed_acc = 0

    n_cells = args.width * args.height

    for it, data in enumerate(collector, start=1):
        global_step += data.numel()

        if args.anneal_lr:
            frac = 1.0 - (it - 1) / num_iters
            optimizer.param_groups[0]["lr"] = frac * args.learning_rate

        alive_mask = data[GROUP, "mask"]                      # [E, T, N]
        actions = data[GROUP, "action"]
        n_active = alive_mask.sum().item()
        n_broadcast = ((actions == A_BROADCAST) & alive_mask).sum().item()
        broadcast_rate = n_broadcast / n_active if n_active > 0 else 0.0

        # ---- kill counting from batch tensors --------------------------------
        colonize_inhabited_start = N_NONTARGETED + 2 * n_cells
        is_kill_action = (actions >= colonize_inhabited_start) & alive_mask
        next_mask_batch = data["next", GROUP, "mask"]
        newly_dead = alive_mask & ~next_mask_batch
        any_kill_action = is_kill_action.any(dim=-1, keepdim=True)
        batch_kills = int((newly_dead & any_kill_action).sum().item())

        # ---- death-cause counters from env infos ----------------------------
        # PettingZooWrapper stores per-agent infos; we read aggregated counts
        # that env.step() now writes into every agent's info dict under the
        # keys "starved", "conquered", "planet_destroyed".
        # The collector stores infos in data["info"] as a dict-of-tensors;
        # keys match what the env returns.  We guard with .get() so the code
        # is safe if the env doesn't populate infos yet.
        info_td = data.get("info")  # may be None for older torchrl versions
        if info_td is not None:
            for key, acc_name in (
                ("starved",          "death_starved_acc"),
                ("conquered",        "death_conquered_acc"),
                ("planet_destroyed", "death_planet_destroyed_acc"),
            ):
                tensor = info_td.get(key)  # shape [E, T] or [E, T, N]
                if tensor is not None:
                    locals()[acc_name]   # just to silence linters
                    if key == "starved":
                        death_starved_acc += int(tensor.sum().item())
                    elif key == "conquered":
                        death_conquered_acc += int(tensor.sum().item())
                    else:
                        death_planet_destroyed_acc += int(tensor.sum().item())

        # episode bookkeeping
        annihilations = []
        done_root = data["next", "done"].squeeze(-1)
        if done_root.any():
            ep_rew = data["next", GROUP, "episode_reward"].squeeze(-1)
            next_pop = data["next", GROUP, "observation", "self"][..., 0]
            next_mask = data["next", GROUP, "mask"]
            idx = done_root.nonzero(as_tuple=False)
            for e, t in idx.tolist():
                return_hist.append(float(ep_rew[e, t].mean()))
                survivors = int(((next_pop[e, t] > 0) & next_mask[e, t]).sum())
                surv_hist.append(survivors)
                annihilations.append(1.0 if survivors <= 1 else 0.0)

        # GAE on the time-structured batch
        with torch.no_grad():
            gae(data)

        # Conquer probability mass (computed post-GAE so features are warm)
        conq_prob = conquer_prob_mass(policy, data, n_cells, device)

        last_losses, approx_kl = ppo_update(
            args, policy, critic, optimizer, data, minibatch_size)

        mean_ret = float(np.mean(return_hist)) if return_hist else float("nan")
        mean_surv = float(np.mean(surv_hist)) if surv_hist else float("nan")
        sps = int(global_step / (time.time() - start))

        if it % 5 == 0 or it == 1:
            print(
                f"[iter {it:4d}/{num_iters}] step={global_step} "
                f"broadcast_rate={broadcast_rate:.4f} "
                f"conquer_prob={conq_prob:.4f} "
                f"killed={batch_kills} "
                f"deaths(starved={death_starved_acc} "
                f"conquered={death_conquered_acc} "
                f"planet_destroyed={death_planet_destroyed_acc}) "
                f"ema={stopper.ema or 0:.4f} "
                f"ep_ret={mean_ret:.2f} survivors={mean_surv:.2f} "
                f"v_loss={last_losses.get('v_loss', float('nan')):.3f} "
                f"SPS={sps}"
            )
            # reset window counters after printing
            death_starved_acc = death_conquered_acc = death_planet_destroyed_acc = 0

        if args.record_every and it % args.record_every == 0:
            path = os.path.join(run_dir, "render", f"iter_{it:05d}.json")
            meta = record_episode(policy, args, device, action_dim, path,
                                  seed=args.seed + it,
                                  deterministic=args.record_deterministic)
            print(f"   [render] {path} length={meta['episode_length']} "
                  f"survivors={meta['survivors']} killed={meta['total_killed']}")

        stop_reason = stopper.update(it, broadcast_rate, annihilations)
        if stop_reason:
            print(f"\n[STOP @ iter {it}] dark-forest criterion met: {stop_reason}")
            break

    collector.shutdown()

    ckpt = os.path.join(run_dir, "checkpoint.pt")
    torch.save({
        "policy": policy.state_dict(),
        "critic": critic.state_dict(),
        "args": vars(args),
        "stopped": stop_reason,
        "global_step": global_step,
    }, ckpt)
    print(f"[done] saved {ckpt} after {global_step} steps "
          f"({'stopped: ' + stop_reason if stop_reason else 'reached total-timesteps'})")

    for ep in range(args.record_episodes):
        path = os.path.join(run_dir, "render", f"final_ep{ep:02d}.json")
        meta = record_episode(policy, args, device, action_dim, path,
                              seed=args.seed + 10_000 + ep,
                              deterministic=args.record_deterministic)
        print(f"[render] {path} length={meta['episode_length']} "
              f"survivors={meta['survivors']} "
              f"killed={meta['total_killed']} "
              f"annihilation={meta['annihilation']}")

    try:
        env.close()
    except RuntimeError:
        pass


if __name__ == "__main__":
    main()