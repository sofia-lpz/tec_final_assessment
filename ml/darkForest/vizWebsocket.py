

from __future__ import annotations

import argparse
import asyncio
import json
import sys

import numpy as np
import torch
import torch.optim as optim
import websockets

# Importing train also exposes env / Civilizations / Planets; its training run
# is guarded by __main__, so the import has no side effects.
import train


# --------------------------------------------------------------------------- #
# Initialization (reuses the functions from train.py)
# --------------------------------------------------------------------------- #
def build_args(argv=None, overrides=None):
    """train.parse_args + train.main()'s post-parse setup, with dict overrides."""
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

    # params from the websocket can set any arg (width, num_envs, names,
    # reward_weights, max_steps, ...). Applied before deriving batch_size.
    for k, v in (overrides or {}).items():
        setattr(args, k, v)

    args.batch_size = args.num_envs * args.num_steps
    return args


def init_vec_env(args):
    """Vectorized multi-agent envs (each a DarkForestParallelEnv)."""
    return train.MAVecEnv(
        [train.make_env_fn(args, i) for i in range(args.num_envs)]
    )


def init_agent(args, vec):
    """PPO actor/critic + Adam optimizer."""
    agent = train.Agent(vec.obs_dim, vec.action_dim, vec.state_dim,
                        vec.N, args.critic, args.hidden_dim)
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


def init_sim(argv=None, overrides=None):
    """Build the whole sim and return its components in a dict."""
    args = build_args(argv, overrides)
    train.random_seed(args.seed, args.torch_deterministic)

    vec = init_vec_env(args)
    agent, optimizer = init_agent(args, vec)
    obs, mask, state, active = vec.reset(seed=args.seed)

    return {
        "args": args, "vec": vec, "agent": agent, "optimizer": optimizer,
        "onehot": build_onehot(vec), "stopper": train.DarkForestStopper(args),
        "obs": obs, "mask": mask, "state": state, "active": active,
    }


# --------------------------------------------------------------------------- #
# Stepping + serialization
# --------------------------------------------------------------------------- #
def _to_rows(arr, batch):  # (E, N, ...) -> (E*N, ...)
    return arr.reshape(batch, *arr.shape[2:])


def select_actions(sim):
    """Masked actions for every env x agent from the current policy."""
    vec, agent = sim["vec"], sim["agent"]
    batch = vec.num_envs * vec.N
    obs = torch.tensor(_to_rows(sim["obs"], batch))
    mask = torch.tensor(_to_rows(sim["mask"], batch))
    state = torch.tensor(np.repeat(sim["state"], vec.N, axis=0))
    with torch.no_grad():
        action, _, _, _ = agent.get_action_and_value(obs, mask, state, sim["onehot"])
    return action.cpu().numpy().reshape(vec.num_envs, vec.N)


def step_sim(sim):
    """Advance every env one step; refresh the cached obs/mask/state/active."""
    obs, mask, state, _rew, _done, active, infos = sim["vec"].step(select_actions(sim))
    sim.update(obs=obs, mask=mask, state=state, active=active)
    return infos


def civ_snapshot(sim, env_index=0):
    """Positions + characteristics of every civ in one env."""
    env = sim["vec"].envs[env_index]
    civs = []
    for name, c in env.civs.items():
        civs.append({
            "name": name,
            "alive": bool(c.alive),
            "coord": [int(c.coord[0]), int(c.coord[1])],
            "population": c.population,
            "science": c.science,
            "resources": c.resources,
            "birth_rate": c.birth_rate,
            "death_rate": c.death_rate,
            "exploration_radius": c.exploration_radius,
            "strength": c.strength,
            "known": [k.name for k in c.known_civilizations],
            "planets": [[int(p.coord[0]), int(p.coord[1])]
                        for p in env.planets if p.civilization is c],
        })
    return {"type": "civs", "env": env_index,
            "step": int(getattr(env, "steps", 0)), "civs": civs}


def _jsond(o):  # numpy scalars -> python
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    raise TypeError(type(o).__name__)


# --------------------------------------------------------------------------- #
# Websocket server
# --------------------------------------------------------------------------- #
async def stream_run(websocket, sim, steps, delay):
    """Step the sim and push a civ snapshot each step until done/cancelled."""
    await websocket.send(json.dumps(civ_snapshot(sim), default=_jsond))
    i = 0
    while steps is None or i < steps:
        step_sim(sim)
        await websocket.send(json.dumps(civ_snapshot(sim), default=_jsond))
        i += 1
        await asyncio.sleep(delay)
    await websocket.send(json.dumps({"type": "done", "steps": i}))


async def handler(websocket, *_):
    task = None
    try:
        async for message in websocket:
            try:
                msg = json.loads(message)
            except (json.JSONDecodeError, TypeError):
                await websocket.send(json.dumps({"type": "error", "error": "bad_json"}))
                continue

            event = msg.get("event")
            if event == "start_training":
                if task:
                    task.cancel()
                params = msg.get("params", {})
                sim = init_sim(overrides=params)
                task = asyncio.create_task(stream_run(
                    websocket, sim,
                    params.get("steps"),            # None -> run until stop/disconnect
                    float(params.get("delay", 0.0)),
                ))
            elif event == "stop":
                if task:
                    task.cancel()
                    task = None
            else:
                await websocket.send(json.dumps(
                    {"type": "error", "error": f"unknown_event:{event}"}))
    finally:
        if task:
            task.cancel()


async def start_server(host="localhost", port=8765):
    """Start the websocket server and serve forever."""
    async with websockets.serve(handler, host, port):
        print(f"[viz] listening on ws://{host}:{port}")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(start_server())
    except KeyboardInterrupt:
        print("\n[viz] stopped")