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
from torchrl.data import LazyTensorStorage, ReplayBuffer
from torchrl.data.replay_buffers.samplers import SamplerWithoutReplacement
from torchrl.envs import RewardSum, StepCounter, TransformedEnv
from torchrl.envs.batched_envs import SerialEnv
from torchrl.envs.libs.pettingzoo import PettingZooWrapper
from torchrl.envs.utils import ExplorationType, MarlGroupMapType, set_exploration_type
from torchrl.modules import MaskedCategorical, MultiAgentMLP, ProbabilisticActor
from torchrl.objectives import ClipPPOLoss, ValueEstimators

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import (  # noqa: E402
    DarkForestParallelEnv,
    A_EXPLORE,
    A_BIRTH,
    A_BROADCAST,
    N_NONTARGETED,
)

GROUP = "agents"

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--torch-deterministic", action="store_true", default=True)
    p.add_argument("--run-name", type=str, default=None)
    p.add_argument("--device", type=str, default="auto")

    # environment
    p.add_argument("--num-envs", type=int, default=4)
    p.add_argument("--names", type=str, nargs="+",
                   default=["Santi", "earth", "aliens"],
                   help="civilization names; count = number of agents")
    p.add_argument("--width", type=int, default=10)
    p.add_argument("--height", type=int, default=10)
    p.add_argument("--initial-planets", type=int, default=8)
    p.add_argument("--max-steps", type=int, default=200)
    p.add_argument("--harvest-rate", type=float, default=0.1)
    p.add_argument("--initial-resources", type=float, default=50.0)
    p.add_argument("--initial-population", type=float, default=10.0)
    p.add_argument("--reward", type=str, nargs="*", default=[],
                   help="override env reward weights, e.g. "
                        "--reward broadcast=0 destroyed=50 conquer=3")

    # PPO
    p.add_argument("--total-timesteps", type=int, default=1_000_000,
                   help="env transitions (num_envs*num_steps per iteration)")
    p.add_argument("--learning-rate", type=float, default=2.5e-4)
    p.add_argument("--anneal-lr", action="store_true", default=True)
    p.add_argument("--num-steps", type=int, default=128,
                   help="rollout length per env per iteration")
    p.add_argument("--gamma", type=float, default=0.99)
    p.add_argument("--gae-lambda", type=float, default=0.95)
    p.add_argument("--num-minibatches", type=int, default=4)
    p.add_argument("--update-epochs", type=int, default=4)
    p.add_argument("--clip-coef", type=float, default=0.2)
    p.add_argument("--ent-coef", type=float, default=0.01)
    p.add_argument("--vf-coef", type=float, default=0.5)
    p.add_argument("--max-grad-norm", type=float, default=0.5)
    p.add_argument("--norm-adv", action="store_true", default=True)
    p.add_argument("--target-kl", type=float, default=None)
    p.add_argument("--hidden-dim", type=int, default=256)
    p.add_argument("--critic", choices=["independent", "centralized"],
                   default="independent",
                   help="independent=IPPO, centralized=MAPPO")

    # dark-forest stopper
    p.add_argument("--stop-mode",
                   choices=["silence", "extermination", "either", "off"],
                   default="silence")
    p.add_argument("--min-iters", type=int, default=30)
    p.add_argument("--silence-threshold", type=float, default=0.01)
    p.add_argument("--silence-patience", type=int, default=10)
    p.add_argument("--broadcast-peak-threshold", type=float, default=0.05)
    p.add_argument("--silence-rel-drop", type=float, default=0.25)
    p.add_argument("--annihilation-threshold", type=float, default=0.95)
    p.add_argument("--ema-beta", type=float, default=0.9)

    # rendering / recording
    p.add_argument("--record-every", type=int, default=0,
                   help="record one render episode every N iterations "
                        "(0 = only at the end)")
    p.add_argument("--record-episodes", type=int, default=1,
                   help="episodes recorded after training finishes")
    p.add_argument("--record-deterministic", action="store_true", default=False,
                   help="use argmax actions when recording")
    return p.parse_args()

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

    env = SerialEnv(args.num_envs, maker, device=device)
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
    if action == A_BIRTH:
        return {"id": int(action), "type": "increase_birth_rate", "target": None}
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


def snapshot_civilizations(env: DarkForestParallelEnv):
    out = []
    for name in env.possible_agents:
        civ = env.civs[name]
        out.append({
            "name": name,
            "alive": bool(civ.alive),
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
    """Play one episode with the current policy on a fresh env and dump a
    JSON file with everything a renderer needs: per-step planets,
    civilizations (full attributes) and the decoded action of each civ."""
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
    while env.agents:
        all_actions = _policy_actions(policy, env, obs, device,
                                      deterministic, action_dim)
        acting = {n: all_actions[n] for n in env.agents}
        obs, rewards, terms, truncs, _ = env.step(acting)
        step += 1
        frames.append({
            "step": step,
            "actions": {n: decode_action(env, a) for n, a in acting.items()},
            "rewards": {n: float(r) for n, r in rewards.items()},
            "terminations": {n: bool(t) for n, t in terms.items()},
            "truncations": {n: bool(t) for n, t in truncs.items()},
            "planets": snapshot_planets(env),
            "civilizations": snapshot_civilizations(env),
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

def main():
    args = parse_args()
    args.reward_weights = {}
    for kv in args.reward:
        k, v = kv.split("=")
        args.reward_weights[k.strip()] = float(v)

    if args.device == "auto":
        args.device = "cuda" if torch.cuda.is_available() else "cpu"
    device = torch.device(args.device)

    run_name = args.run_name or f"darkforest_torchrl_{args.critic}_{int(time.time())}"
    run_dir = os.path.join("runs", run_name)
    os.makedirs(run_dir, exist_ok=True)

    import random
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.backends.cudnn.deterministic = args.torch_deterministic

    frames_per_batch = args.num_envs * args.num_steps
    num_iters = max(1, args.total_timesteps // frames_per_batch)
    minibatch_size = max(1, frames_per_batch // args.num_minibatches)

    env = make_torchrl_env(args, device)
    env.set_seed(args.seed)
    policy, critic, obs_dim, action_dim, n_agents = build_models(args, env, device)

    print(f"[setup] run={run_name} critic={args.critic} device={device} "
          f"n_agents={n_agents} obs_dim={obs_dim} action_dim={action_dim} "
          f"iters={num_iters} stop-mode={args.stop_mode}")

    collector = SyncDataCollector(
        env,
        policy,
        device=device,
        frames_per_batch=frames_per_batch,
        total_frames=num_iters * frames_per_batch,
    )

    replay_buffer = ReplayBuffer(
        storage=LazyTensorStorage(frames_per_batch, device=device),
        sampler=SamplerWithoutReplacement(),
        batch_size=minibatch_size,
    )

    loss_module = ClipPPOLoss(
        actor_network=policy,
        critic_network=critic,
        clip_epsilon=args.clip_coef,
        entropy_bonus=args.ent_coef > 0,
        entropy_coeff=args.ent_coef,
        critic_coeff=args.vf_coef,
        normalize_advantage=args.norm_adv,
        clip_value=args.clip_coef,        # value clipping like cleanRL
    )
    loss_module.set_keys(
        reward=(GROUP, "reward"),
        action=(GROUP, "action"),
        sample_log_prob=(GROUP, "sample_log_prob"),
        value=(GROUP, "state_value"),
        done=(GROUP, "done"),
        terminated=(GROUP, "terminated"),
        advantage=(GROUP, "advantage"),
        value_target=(GROUP, "value_target"),
    )
    loss_module.make_value_estimator(
        ValueEstimators.GAE, gamma=args.gamma, lmbda=args.gae_lambda)

    optimizer = torch.optim.Adam(loss_module.parameters(),
                                 lr=args.learning_rate, eps=1e-5)

    stopper = DarkForestStopper(args)
    return_hist = deque(maxlen=100)
    surv_hist = deque(maxlen=100)
    global_step = 0
    start = time.time()
    stop_reason = None

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

        # episode bookkeeping (returns / survivors / annihilation)
        annihilations = []
        done_root = data["next", "done"].squeeze(-1)          # [E, T]
        if done_root.any():
            ep_rew = data["next", GROUP, "episode_reward"].squeeze(-1)  # [E,T,N]
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
            loss_module.value_estimator(
                data,
                params=loss_module.critic_network_params,
                target_params=loss_module.target_critic_network_params,
            )
        # dead/padded agents must not contribute to the policy gradient
        adv = data[GROUP, "advantage"]
        adv = adv * alive_mask.unsqueeze(-1).to(adv.dtype)
        data.set((GROUP, "advantage"), adv)

        replay_buffer.empty()
        replay_buffer.extend(data.reshape(-1))

        last_losses = {}
        approx_kl = None
        for _ in range(args.update_epochs):
            for _ in range(frames_per_batch // minibatch_size):
                sample = replay_buffer.sample()
                loss_vals = loss_module(sample)
                loss = (loss_vals["loss_objective"]
                        + loss_vals["loss_critic"]
                        + loss_vals.get("loss_entropy", 0.0))
                optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(loss_module.parameters(),
                                         args.max_grad_norm)
                optimizer.step()
                last_losses = {k: float(v.detach())
                               for k, v in loss_vals.items()
                               if k.startswith("loss") or k == "kl_approx"}
                if "kl_approx" in loss_vals.keys():
                    approx_kl = float(loss_vals["kl_approx"].detach())
            if (args.target_kl is not None and approx_kl is not None
                    and approx_kl > args.target_kl):
                break

        mean_ret = float(np.mean(return_hist)) if return_hist else float("nan")
        mean_surv = float(np.mean(surv_hist)) if surv_hist else float("nan")
        sps = int(global_step / (time.time() - start))

        if it % 5 == 0 or it == 1:
            print(f"[iter {it:4d}/{num_iters}] step={global_step} "
                  f"broadcast_rate={broadcast_rate:.4f} "
                  f"ema={stopper.ema or 0:.4f} "
                  f"ep_ret={mean_ret:.2f} survivors={mean_surv:.2f} "
                  f"v_loss={last_losses.get('loss_critic', float('nan')):.3f} "
                  f"SPS={sps}")

        if args.record_every and it % args.record_every == 0:
            path = os.path.join(run_dir, "render", f"iter_{it:05d}.json")
            meta = record_episode(policy, args, device, action_dim, path,
                                  seed=args.seed + it,
                                  deterministic=args.record_deterministic)
            print(f"   [render] {path} length={meta['episode_length']} "
                  f"survivors={meta['survivors']}")

        stop_reason = stopper.update(it, broadcast_rate, annihilations)
        if stop_reason:
            print(f"\n[STOP @ iter {it}] dark-forest criterion met: {stop_reason}")
            break

    collector.shutdown()

    # checkpoint
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

    # final render recordings (for the visualizer)
    for ep in range(args.record_episodes):
        path = os.path.join(run_dir, "render", f"final_ep{ep:02d}.json")
        meta = record_episode(policy, args, device, action_dim, path,
                              seed=args.seed + 10_000 + ep,
                              deterministic=args.record_deterministic)
        print(f"[render] {path} length={meta['episode_length']} "
              f"survivors={meta['survivors']} "
              f"annihilation={meta['annihilation']}")

    try:
        env.close()
    except RuntimeError:
        pass  # the collector may already have closed the env


if __name__ == "__main__":
    main()