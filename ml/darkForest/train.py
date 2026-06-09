#train

import argparse
import os
import sys
import time
from collections import deque

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions.categorical import Categorical

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import DarkForestParallelEnv, A_BROADCAST  


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--torch-deterministic", action="store_true", default=True)
    p.add_argument("--run-name", type=str, default=None)
    p.add_argument("--tensorboard", action="store_true", default=False)

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

    p.add_argument("--total-timesteps", type=int, default=1_000_000,
                   help="env transitions (num_envs*num_steps per iteration)")
    p.add_argument("--learning-rate", type=float, default=2.5e-4)
    p.add_argument("--anneal-lr", action="store_true", default=True)
    p.add_argument("--num-steps", type=int, default=128)
    p.add_argument("--gamma", type=float, default=0.99)
    p.add_argument("--gae-lambda", type=float, default=0.95)
    p.add_argument("--num-minibatches", type=int, default=4)
    p.add_argument("--update-epochs", type=int, default=4)
    p.add_argument("--clip-coef", type=float, default=0.2)
    p.add_argument("--clip-vloss", action="store_true", default=True)
    p.add_argument("--ent-coef", type=float, default=0.01)
    p.add_argument("--vf-coef", type=float, default=0.5)
    p.add_argument("--max-grad-norm", type=float, default=0.5)
    p.add_argument("--norm-adv", action="store_true", default=True)
    p.add_argument("--target-kl", type=float, default=None)
    p.add_argument("--hidden-dim", type=int, default=256)
    p.add_argument("--critic", choices=["independent", "centralized"],
                   default="independent")

    p.add_argument("--stop-mode",
                   choices=["silence", "extermination", "either", "off"],
                   default="silence",
                   help="silence: broadcast rate collapses to ~0 after being "
                        "used; extermination: episodes reliably end with <=1 "
                        "survivor; either: whichever first; off: train to "
                        "--total-timesteps.")
    p.add_argument("--min-iters", type=int, default=30,
                   help="never stop before this many iterations (avoids "
                        "stopping on initial randomness)")
    p.add_argument("--silence-threshold", type=float, default=0.01,
                   help="broadcast-rate EMA below this counts as 'silent'")
    p.add_argument("--silence-patience", type=int, default=10,
                   help="consecutive silent iterations required to stop")
    p.add_argument("--broadcast-peak-threshold", type=float, default=0.05,
                   help="broadcasting must have peaked at least this high, so "
                        "we only stop on *learned* silence, not never-used")
    p.add_argument("--silence-rel-drop", type=float, default=0.25,
                   help="also count as 'silent' if the EMA falls to this "
                        "fraction of its peak (captures collapse without "
                        "needing the rate to literally hit 0)")
    p.add_argument("--annihilation-threshold", type=float, default=0.95,
                   help="fraction of recent episodes ending with <=1 survivor")
    p.add_argument("--ema-beta", type=float, default=0.9)
    return p.parse_args()


class CategoricalMasked(Categorical):
    def __init__(self, logits, masks):
        masks = masks.bool()
        empty = ~masks.any(dim=-1)
        if empty.any():
            masks = masks.clone()
            masks[empty, 0] = True
        self.masks = masks
        neg = torch.finfo(logits.dtype).min
        logits = torch.where(self.masks, logits, torch.full_like(logits, neg))
        super().__init__(logits=logits)

    def entropy(self):
        p_log_p = self.logits * self.probs
        p_log_p = torch.where(self.masks, p_log_p, torch.zeros_like(p_log_p))
        return -p_log_p.sum(-1)


def layer_init(layer, std=np.sqrt(2), bias_const=0.0):
    nn.init.orthogonal_(layer.weight, std)
    nn.init.constant_(layer.bias, bias_const)
    return layer


class Agent(nn.Module):
    def __init__(self, obs_dim, action_dim, state_dim, n_agents,
                 critic_mode, hidden=256):
        super().__init__()
        self.critic_mode = critic_mode
        self.n_agents = n_agents

        self.actor = nn.Sequential(
            layer_init(nn.Linear(obs_dim, hidden)), nn.Tanh(),
            layer_init(nn.Linear(hidden, hidden)), nn.Tanh(),
            layer_init(nn.Linear(hidden, action_dim), std=0.01),
        )
        critic_in = (state_dim + n_agents) if critic_mode == "centralized" else obs_dim
        self.critic = nn.Sequential(
            layer_init(nn.Linear(critic_in, hidden)), nn.Tanh(),
            layer_init(nn.Linear(hidden, hidden)), nn.Tanh(),
            layer_init(nn.Linear(hidden, 1), std=1.0),
        )

    def get_value(self, obs, state, onehot):
        if self.critic_mode == "centralized":
            return self.critic(torch.cat([state, onehot], dim=-1))
        return self.critic(obs)

    def get_action_and_value(self, obs, mask, state, onehot, action=None):
        logits = self.actor(obs)
        dist = CategoricalMasked(logits, mask)
        if action is None:
            action = dist.sample()
        return (action, dist.log_prob(action), dist.entropy(),
                self.get_value(obs, state, onehot).squeeze(-1))


class MAVecEnv:
    def __init__(self, env_fns):
        self.envs = [fn() for fn in env_fns]
        self.num_envs = len(self.envs)
        e0 = self.envs[0]
        self.possible_agents = list(e0.possible_agents)
        self.N = len(self.possible_agents)
        self._slot = {n: i for i, n in enumerate(self.possible_agents)}

        msp = e0.observation_space(self.possible_agents[0])
        c, h, w = msp["map"].shape
        self.map_size = c * h * w
        self.self_size = msp["self"].shape[0]
        self.obs_dim = self.map_size + self.self_size
        self.action_dim = e0.action_dim
        self.state_dim = e0.state_space.shape[0]

        self._placeholder_mask = np.zeros(self.action_dim, dtype=np.float32)
        self._placeholder_mask[0] = 1.0  # explore-only -> always finite
        self._cur = [None] * self.num_envs   # name -> obs dict (alive only)
        self._ep_len = [0] * self.num_envs

    def _flat_obs(self, o):
        return np.concatenate([o["map"].ravel(), o["self"]]).astype(np.float32)

    def _batch(self):
        obs = np.zeros((self.num_envs, self.N, self.obs_dim), dtype=np.float32)
        mask = np.zeros((self.num_envs, self.N, self.action_dim), dtype=np.float32)
        state = np.zeros((self.num_envs, self.state_dim), dtype=np.float32)
        active = np.zeros((self.num_envs, self.N), dtype=np.float32)
        for i, e in enumerate(self.envs):
            state[i] = e.state().astype(np.float32)
            for name, slot in self._slot.items():
                o = self._cur[i].get(name)
                if o is None:
                    mask[i, slot] = self._placeholder_mask
                else:
                    obs[i, slot] = self._flat_obs(o)
                    mask[i, slot] = o["action_mask"].astype(np.float32)
                    active[i, slot] = 1.0
        return obs, mask, state, active

    def reset(self, seed=None):
        for i, e in enumerate(self.envs):
            s = None if seed is None else seed + i
            o, _ = e.reset(seed=s)
            self._cur[i] = dict(o)
            self._ep_len[i] = 0
        obs, mask, state, active = self._batch()
        return obs, mask, state, active

    def step(self, actions):
        rewards = np.zeros((self.num_envs, self.N), dtype=np.float32)
        dones = np.zeros((self.num_envs, self.N), dtype=np.float32)
        infos = [dict() for _ in range(self.num_envs)]
        for i, e in enumerate(self.envs):
            alive = list(e.agents)
            act = {n: int(actions[i, self._slot[n]]) for n in alive}
            obs, rew, term, trunc, _ = e.step(act)
            self._ep_len[i] += 1
            for n in rew:
                slot = self._slot[n]
                rewards[i, slot] = rew[n]
                dones[i, slot] = float(term[n] or trunc[n])
            if len(e.agents) == 0:
                survivors = sum(1 for c in e.civs.values() if c.alive)
                infos[i] = {"episode_end": True,
                            "survivors": survivors,
                            "annihilation": survivors <= 1,
                            "length": self._ep_len[i]}
                o2, _ = e.reset()
                self._cur[i] = dict(o2)
                self._ep_len[i] = 0
            else:
                self._cur[i] = {n: obs[n] for n in e.agents}
        nobs, nmask, nstate, nactive = self._batch()
        return nobs, nmask, nstate, rewards, dones, nactive, infos


def make_env_fn(args, idx):
    def thunk():
        return DarkForestParallelEnv(
            names=args.names, width=args.width, height=args.height,
            initial_planets=args.initial_planets, max_steps=args.max_steps,
            harvest_rate=args.harvest_rate,
            initial_resources=args.initial_resources,
            initial_population=args.initial_population,
            reward_weights=args.reward_weights or None,
        )
    return thunk


class DarkForestStopper:
    def __init__(self, args):
        self.mode = args.stop_mode
        self.min_iters = args.min_iters
        self.sil_thr = args.silence_threshold
        self.sil_patience = args.silence_patience
        self.peak_thr = args.broadcast_peak_threshold
        self.rel_drop = args.silence_rel_drop
        self.ann_thr = args.annihilation_threshold
        self.beta = args.ema_beta
        self.ema = None
        self.peak = 0.0
        self.silent_streak = 0
        self.recent_ann = deque(maxlen=50)

    def update(self, it, broadcast_rate, episode_infos):
        self.ema = (broadcast_rate if self.ema is None
                    else self.beta * self.ema + (1 - self.beta) * broadcast_rate)
        self.peak = max(self.peak, self.ema)
        collapsed = self.peak >= self.peak_thr and self.ema <= self.rel_drop * self.peak
        silent_now = (self.ema < self.sil_thr) or collapsed
        self.silent_streak = self.silent_streak + 1 if silent_now else 0
        for info in episode_infos:
            if info.get("episode_end"):
                self.recent_ann.append(1.0 if info["annihilation"] else 0.0)

        if self.mode == "off" or it < self.min_iters:
            return None

        silence = (self.peak >= self.peak_thr
                   and self.silent_streak >= self.sil_patience)
        ann_rate = np.mean(self.recent_ann) if self.recent_ann else 0.0
        extermination = (len(self.recent_ann) >= self.recent_ann.maxlen
                         and ann_rate >= self.ann_thr)

        if self.mode == "silence" and silence:
            return (f"broadcast silence (EMA={self.ema:.4f} for "
                    f"{self.silent_streak} iters; peaked at {self.peak:.3f})")
        if self.mode == "extermination" and extermination:
            return f"extermination ({ann_rate:.0%} of recent episodes annihilated)"
        if self.mode == "either" and (silence or extermination):
            return ("broadcast silence" if silence
                    else f"extermination ({ann_rate:.0%})")
        return None

class PPOTrainer:
    """Steppable PPO loop. Same math/order as the original monolithic main(),
    just split so a rollout step can be driven (and visualized) one at a time."""

    def __init__(self, args):
        self.args = args
        random_seed(args.seed, args.torch_deterministic)

        self.vec = MAVecEnv([make_env_fn(args, i) for i in range(args.num_envs)])
        vec = self.vec
        self.N, self.E = vec.N, vec.num_envs
        self.batch = self.E * self.N
        N, E, batch = self.N, self.E, self.batch

        self.agent = Agent(vec.obs_dim, vec.action_dim, vec.state_dim, N,
                           args.critic, args.hidden_dim)
        self.optimizer = optim.Adam(self.agent.parameters(),
                                    lr=args.learning_rate, eps=1e-5)

        self.onehot_all = torch.zeros(batch, N)
        for i in range(E):
            for a in range(N):
                self.onehot_all[i * N + a, a] = 1.0

        T = self.T = args.num_steps
        self.obs_b = torch.zeros((T, batch, vec.obs_dim))
        self.mask_b = torch.zeros((T, batch, vec.action_dim))
        self.state_b = torch.zeros((T, batch, vec.state_dim))
        self.act_b = torch.zeros((T, batch), dtype=torch.long)
        self.logp_b = torch.zeros((T, batch))
        self.val_b = torch.zeros((T, batch))
        self.rew_b = torch.zeros((T, batch))
        self.done_b = torch.zeros((T, batch))
        self.active_b = torch.zeros((T, batch))

        obs_np, mask_np, state_np, active_np = vec.reset(seed=args.seed)
        self.active_np = active_np
        self.next_obs = torch.tensor(self._to_rows(obs_np))
        self.next_mask = torch.tensor(self._to_rows(mask_np))
        self.next_state = torch.tensor(np.repeat(state_np, N, axis=0))
        self.next_done = torch.zeros(batch)
        self.next_active = torch.tensor(active_np.reshape(batch))

        self.stopper = DarkForestStopper(args)
        self.ep_return = np.zeros(batch, dtype=np.float64)
        self.return_hist = deque(maxlen=100)
        self.surv_hist = deque(maxlen=100)
        self.global_step = 0
        self.num_iters = args.total_timesteps // args.batch_size
        self.start = time.time()
        self.stop_reason = None
        self.it = 0
        self._n_broadcast = self._n_active = 0.0
        self._ep_infos = []

    def _to_rows(self, arr):  # (E, N, ...) -> (E*N, ...)
        return arr.reshape(self.batch, *arr.shape[2:])

    def rollout_step(self, step):
        """One env step; fills buffers[step]. Returns the per-env infos."""
        self.global_step += self.E
        self.obs_b[step] = self.next_obs
        self.mask_b[step] = self.next_mask
        self.state_b[step] = self.next_state
        self.done_b[step] = self.next_done
        self.active_b[step] = self.next_active

        with torch.no_grad():
            action, logp, _, value = self.agent.get_action_and_value(
                self.next_obs, self.next_mask, self.next_state, self.onehot_all)
        self.val_b[step] = value
        self.act_b[step] = action
        self.logp_b[step] = logp

        act_np = action.cpu().numpy().reshape(self.E, self.N)
        self._n_broadcast += float(((act_np == A_BROADCAST) & (self.active_np > 0)).sum())
        self._n_active += float(self.active_np.sum())

        obs_np, mask_np, state_np, rew_np, done_np, active_np, infos = self.vec.step(act_np)
        self.active_np = active_np
        self.rew_b[step] = torch.tensor(rew_np.reshape(self.batch))

        self.ep_return += rew_np.reshape(self.batch)
        done_flat = done_np.reshape(self.batch)
        for r in range(self.batch):
            if done_flat[r] > 0:
                self.return_hist.append(self.ep_return[r])
                self.ep_return[r] = 0.0
        for info in infos:
            if info.get("episode_end"):
                self.surv_hist.append(info["survivors"])
                self._ep_infos.append(info)

        self.next_obs = torch.tensor(self._to_rows(obs_np))
        self.next_mask = torch.tensor(self._to_rows(mask_np))
        self.next_state = torch.tensor(np.repeat(state_np, self.N, axis=0))
        self.next_done = torch.tensor(done_flat, dtype=torch.float32)
        self.next_active = torch.tensor(active_np.reshape(self.batch))
        return infos

    def _optimize(self):
        """GAE + PPO update over the collected rollout.
        Returns the last v_loss, or None if there were no live rows."""
        args, T, batch = self.args, self.T, self.batch
        with torch.no_grad():
            next_value = self.agent.get_value(self.next_obs, self.next_state, self.onehot_all).squeeze(-1)
            adv = torch.zeros_like(self.rew_b)
            lastgae = torch.zeros(batch)
            for t in reversed(range(T)):
                if t == T - 1:
                    nonterminal = 1.0 - self.next_done
                    nextval = next_value
                else:
                    nonterminal = 1.0 - self.done_b[t + 1]
                    nextval = self.val_b[t + 1]
                delta = self.rew_b[t] + args.gamma * nextval * nonterminal - self.val_b[t]
                adv[t] = lastgae = delta + args.gamma * args.gae_lambda * nonterminal * lastgae
            returns = adv + self.val_b

        b_obs = self.obs_b.reshape(-1, self.vec.obs_dim)
        b_mask = self.mask_b.reshape(-1, self.vec.action_dim)
        b_state = self.state_b.reshape(-1, self.vec.state_dim)
        b_onehot = self.onehot_all.repeat(T, 1)
        b_act = self.act_b.reshape(-1)
        b_logp = self.logp_b.reshape(-1)
        b_val = self.val_b.reshape(-1)
        b_adv = adv.reshape(-1)
        b_ret = returns.reshape(-1)
        b_active = self.active_b.reshape(-1)

        live_idx = torch.nonzero(b_active > 0, as_tuple=False).squeeze(-1)
        if live_idx.numel() == 0:
            return None
        mb_size = max(1, live_idx.numel() // args.num_minibatches)

        approx_kl = torch.tensor(0.0)
        v_loss = torch.tensor(0.0)
        for _ in range(args.update_epochs):
            perm = live_idx[torch.randperm(live_idx.numel())]
            for s in range(0, perm.numel(), mb_size):
                mb = perm[s:s + mb_size]
                _, newlogp, entropy, newval = self.agent.get_action_and_value(
                    b_obs[mb], b_mask[mb], b_state[mb], b_onehot[mb], b_act[mb])
                logratio = newlogp - b_logp[mb]
                ratio = logratio.exp()
                with torch.no_grad():
                    approx_kl = ((ratio - 1) - logratio).mean()

                mb_adv = b_adv[mb]
                if args.norm_adv and mb_adv.numel() > 1:
                    mb_adv = (mb_adv - mb_adv.mean()) / (mb_adv.std() + 1e-8)

                pg1 = -mb_adv * ratio
                pg2 = -mb_adv * torch.clamp(ratio, 1 - args.clip_coef, 1 + args.clip_coef)
                pg_loss = torch.max(pg1, pg2).mean()

                if args.clip_vloss:
                    v_unclipped = (newval - b_ret[mb]) ** 2
                    v_clipped = b_val[mb] + torch.clamp(
                        newval - b_val[mb], -args.clip_coef, args.clip_coef)
                    v_clipped = (v_clipped - b_ret[mb]) ** 2
                    v_loss = 0.5 * torch.max(v_unclipped, v_clipped).mean()
                else:
                    v_loss = 0.5 * ((newval - b_ret[mb]) ** 2).mean()

                ent_loss = entropy.mean()
                loss = pg_loss - args.ent_coef * ent_loss + args.vf_coef * v_loss

                self.optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(self.agent.parameters(), args.max_grad_norm)
                self.optimizer.step()

            if args.target_kl is not None and approx_kl > args.target_kl:
                break
        return v_loss

    def train_iteration(self):
        """One full PPO iteration (T rollout steps + one update).
        Returns a metrics dict, or None if the update was skipped."""
        args = self.args
        self.it += 1
        if args.anneal_lr:
            self.optimizer.param_groups[0]["lr"] = (1 - (self.it - 1) / self.num_iters) * args.learning_rate

        self._n_broadcast = 0.0
        self._n_active = 0.0
        self._ep_infos = []

        for step in range(self.T):
            self.rollout_step(step)

        v_loss = self._optimize()
        if v_loss is None:            # no live rows -> matches original `continue`
            return None

        broadcast_rate = (self._n_broadcast / self._n_active) if self._n_active > 0 else 0.0
        mean_ret = float(np.mean(self.return_hist)) if self.return_hist else float("nan")
        mean_surv = float(np.mean(self.surv_hist)) if self.surv_hist else float("nan")
        sps = int(self.global_step / (time.time() - self.start))

        if self.it % 5 == 0 or self.it == 1:
            print(f"[iter {self.it:4d}/{self.num_iters}] step={self.global_step} "
                  f"broadcast_rate={broadcast_rate:.4f} ema={self.stopper.ema or 0:.4f} "
                  f"ep_ret={mean_ret:.2f} survivors={mean_surv:.2f} "
                  f"value_loss={float(v_loss):.3f} SPS={sps}")

        self.stop_reason = self.stopper.update(self.it, broadcast_rate, self._ep_infos)
        if self.stop_reason:
            print(f"\n[STOP @ iter {self.it}] dark-forest criterion met: {self.stop_reason}")
        return {"broadcast_rate": broadcast_rate, "mean_ret": mean_ret,
                "mean_surv": mean_surv, "v_loss": float(v_loss),
                "stop_reason": self.stop_reason}

    def run(self, run_name):
        """Full training run + checkpoint (reproduces the original main())."""
        for _ in range(self.num_iters):
            self.train_iteration()
            if self.stop_reason:
                break

        os.makedirs("runs", exist_ok=True)
        ckpt = f"runs/{run_name}.pt"
        torch.save({"agent": self.agent.state_dict(), "args": vars(self.args),
                    "stopped": self.stop_reason, "global_step": self.global_step}, ckpt)
        print(f"[done] saved {ckpt} after {self.global_step} steps "
              f"({'stopped: ' + self.stop_reason if self.stop_reason else 'reached total-timesteps'})")
        vec_close(self.vec)


def main():
    args = parse_args()
    args.reward_weights = {}
    for kv in args.reward:
        k, v = kv.split("=")
        args.reward_weights[k.strip()] = float(v)
    args.batch_size = args.num_envs * args.num_steps
    run_name = args.run_name or f"darkforest_{args.critic}_{int(time.time())}"

    print(f"[setup] run={run_name} critic={args.critic} "
          f"stop-mode={args.stop_mode}")

    trainer = PPOTrainer(args)
    trainer.run(run_name)


def vec_close(vec):
    for e in vec.envs:
        e.close()


def random_seed(seed, deterministic):
    import random
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.backends.cudnn.deterministic = deterministic


if __name__ == "__main__":
    main()