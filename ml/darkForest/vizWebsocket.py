from __future__ import annotations

import argparse
import sys

import torch
import torch.optim as optim

# Importing train also puts its directory on sys.path (env, Civilizations,
# Planets become importable). Its training run is guarded by __main__, so this
# import has no side effects.
import train


def build_args(argv=None):
    """Reuse train.parse_args, then replay train.main()'s post-parse setup."""
    saved = sys.argv
    sys.argv = [saved[0]] + list(argv or [])
    try:
        args = train.parse_args()
    finally:
        sys.argv = saved

    args.reward_weights = {}
    for kv in args.reward:
        k, v = kv.split("=")
        args.reward_weights[k.strip()] = float(v)
    args.batch_size = args.num_envs * args.num_steps
    return args


def init_vec_env(args):
    """Vectorized multi-agent envs (each a DarkForestParallelEnv)."""
    return train.MAVecEnv(
        [train.make_env_fn(args, i) for i in range(args.num_envs)]
    )


def init_agent(args, vec):
    """PPO actor/critic + Adam optimizer."""
    agent = train.Agent(
        vec.obs_dim, vec.action_dim, vec.state_dim,
        vec.N, args.critic, args.hidden_dim,
    )
    optimizer = optim.Adam(agent.parameters(), lr=args.learning_rate, eps=1e-5)
    return agent, optimizer


def build_onehot(vec):
    """Agent-id one-hot for the centralized critic (one row per env x agent)."""
    batch = vec.num_envs * vec.N
    onehot = torch.zeros(batch, vec.N)
    for i in range(vec.num_envs):
        for a in range(vec.N):
            onehot[i * vec.N + a, a] = 1.0
    return onehot


def init_sim(argv=None):
    """Initialize the whole simulation and return everything as a dict."""
    args = build_args(argv)
    train.random_seed(args.seed, args.torch_deterministic)

    vec = init_vec_env(args)
    agent, optimizer = init_agent(args, vec)
    onehot = build_onehot(vec)
    stopper = train.DarkForestStopper(args)

    # initial observations / masks / state / active flags
    obs, mask, state, active = vec.reset(seed=args.seed)

    return {
        "args": args,
        "vec": vec,
        "agent": agent,
        "optimizer": optimizer,
        "onehot": onehot,
        "stopper": stopper,
        "obs": obs,
        "mask": mask,
        "state": state,
        "active": active,
    }


if __name__ == "__main__":
    sim = init_sim()
    vec = sim["vec"]
    print(f"initialized: {vec.N} agents x {vec.num_envs} envs, "
          f"obs_dim={vec.obs_dim} action_dim={vec.action_dim} "
          f"state_dim={vec.state_dim}")