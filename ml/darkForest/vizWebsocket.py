"""



Protocol (client -> server):
  {"cmd": "start", "config": {...}}   config keys = any train.py arg
                                      (underscores), e.g. num_envs, width,
                                      total_timesteps, names, reward...
                                      plus: include_explored_cells (bool),
                                      stream_every (int, emit every k-th step)
  {"cmd": "stop"}                     abort the current training run

Server -> client payload types: "started", "step", "iteration", "done",
"stopped", "error".

Run:  python websocket.py [--host 0.0.0.0] [--port 8765]
"""

import argparse
import asyncio
import json
import sys
import threading
import time

import numpy as np
import websockets

import train
from train import PPOTrainer
from env import N_NONTARGETED, A_EXPLORE, A_BIRTH, A_BROADCAST, MAX_PLANET_RESOURCES


def build_args(**overrides):
    argv_backup = sys.argv
    sys.argv = [argv_backup[0]]
    try:
        args = train.parse_args()
    finally:
        sys.argv = argv_backup

    for k, v in overrides.items():
        if not hasattr(args, k):
            raise AttributeError(f"unknown arg override: {k}")
        setattr(args, k, v)

    args.reward_weights = {}
    for kv in args.reward:
        k, v = kv.split("=")
        args.reward_weights[k.strip()] = float(v)
    args.batch_size = args.num_envs * args.num_steps
    return args


_NONTARGETED_NAMES = {A_EXPLORE: "explore", A_BIRTH: "increase_birth_rate",
                      A_BROADCAST: "broadcast"}
_TARGETED_NAMES = {0: "colonize_empty", 1: "destroy_planet", 2: "colonize_inhabited"}


def decode_action(env, action_id):
    action_id = int(action_id)
    if action_id < N_NONTARGETED:
        return {"id": action_id, "type": _NONTARGETED_NAMES[action_id], "target": None}
    ttype, cidx = divmod(action_id - N_NONTARGETED, env.n_cells)
    return {"id": action_id, "type": _TARGETED_NAMES[ttype],
            "target": [cidx // env.width, cidx % env.width]}


def snapshot_planets(env):
    return [{
        "coord": list(p.coord),
        "resources": float(p.resources),
        "resources_norm": float(p.resources) / MAX_PLANET_RESOURCES,
        "owner": p.civilization.name if p.civilization is not None else None,
        "destroyed": bool(p.destroyed),
    } for p in env.planets]


def snapshot_civs(env):
    civs = []
    for name in env.possible_agents:
        c = env.civs[name]
        civs.append({
            "name": name,
            "coord": list(c.coord),
            "alive": bool(c.alive),
            "population": float(c.population),
            "science": float(c.science),
            "resources": float(c.resources),
            "birth_rate": float(c.birth_rate),
            "death_rate": float(c.death_rate),
            "strength": float(c.strength),
            "exploration_radius": int(c.exploration_radius),
            "planets_owned": sum(1 for p in env.planets if p.civilization is c),
            "known_civilizations": [k.name for k in c.known_civilizations],
            "explored_cells": sorted([list(cell) for cell in c.explored_cells]),
            "n_explored": len(c.explored_cells),
        })
    return civs


class StopTraining(Exception):
    pass


class TrainingStreamer:
    def __init__(self, args, emit, include_explored_cells=True, stream_every=1,
                 stop_event=None):
        self.args = args
        self.emit = emit
        self.include_explored_cells = include_explored_cells
        self.stream_every = max(1, int(stream_every))
        self.stop_event = stop_event or threading.Event()
        self.trainer = PPOTrainer(args)
        self._hook_rollout()
        self._frame = 0

    def _hook_rollout(self):
        original = self.trainer.rollout_step

        def hooked(step):
            if self.stop_event.is_set():
                raise StopTraining
            infos = original(step)
            self._on_step(step, infos)
            return infos

        self.trainer.rollout_step = hooked

    def _on_step(self, step, infos):
        self._frame += 1
        if self._frame % self.stream_every != 0:
            return
        t = self.trainer
        vec = t.vec
        N = vec.N
        actions = t.act_b[step].cpu().numpy()
        rewards = t.rew_b[step].cpu().numpy()
        active = t.active_b[step].cpu().numpy()

        env_payloads = []
        for i, e in enumerate(vec.envs):
            acts, rews = {}, {}
            for name, slot in vec._slot.items():
                row = i * N + slot
                rews[name] = float(rewards[row])
                if active[row] > 0:
                    acts[name] = decode_action(e, actions[row])

            civs = snapshot_civs(e)
            if not self.include_explored_cells:
                for c in civs:
                    c.pop("explored_cells")

            env_payloads.append({
                "env_id": i,
                "episode_step": vec._ep_len[i],
                "planets": snapshot_planets(e),
                "civilizations": civs,
                "actions": acts,
                "rewards": rews,
                "episode_end": infos[i] if infos[i].get("episode_end") else None,
            })

        self.emit({
            "type": "step",
            "frame": self._frame,
            "iteration": t.it,
            "rollout_step": step,
            "global_step": t.global_step,
            "grid": {"width": vec.envs[0].width, "height": vec.envs[0].height},
            "agents": vec.possible_agents,
            "envs": env_payloads,
        })

    def _train_stats(self, metrics):
        t = self.trainer
        s = t.stopper
        elapsed = time.time() - t.start
        ann = list(s.recent_ann)
        return {
            # what train.py prints each iteration
            "iteration": t.it,
            "num_iters": t.num_iters,
            "global_step": t.global_step,
            "broadcast_rate": metrics["broadcast_rate"] if metrics else None,
            "broadcast_ema": s.ema,
            "mean_episode_return": metrics["mean_ret"] if metrics else None,
            "mean_survivors": metrics["mean_surv"] if metrics else None,
            "value_loss": metrics["v_loss"] if metrics else None,
            "sps": int(t.global_step / elapsed) if elapsed > 0 else 0,
            "elapsed_seconds": elapsed,
            "learning_rate": t.optimizer.param_groups[0]["lr"],
            "update_skipped": metrics is None,  # no live rows this iteration
            # early-stop (dark-forest criterion) internals
            "stopper": {
                "mode": s.mode,
                "ema": s.ema,
                "peak": s.peak,
                "silent_streak": s.silent_streak,
                "annihilation_rate": float(np.mean(ann)) if ann else 0.0,
                "episodes_tracked": len(ann),
            },
            # recent episode history (deques of up to 100)
            "recent_returns": [float(r) for r in t.return_hist],
            "recent_survivors": [float(v) for v in t.surv_hist],
            # episodes that finished during this iteration
            "episodes_this_iter": list(t._ep_infos),
            "stop_reason": t.stop_reason,
        }

    def run(self, max_iterations=None):
        total = self.trainer.num_iters if max_iterations is None \
            else min(max_iterations, self.trainer.num_iters)
        for _ in range(total):
            metrics = self.trainer.train_iteration()
            self.emit({
                "type": "iteration",
                "iteration": self.trainer.it,
                "global_step": self.trainer.global_step,
                "stats": self._train_stats(metrics),
                "stop_reason": self.trainer.stop_reason,
            })
            if self.trainer.stop_reason:
                break
        self.emit({
            "type": "done",
            "iterations": self.trainer.it,
            "global_step": self.trainer.global_step,
            "stop_reason": self.trainer.stop_reason,
        })


def _np_default(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(f"not JSON serializable: {type(o)}")


def _sanitize(o):
    """Strict JSON: NaN/Inf -> null (Python's json would emit invalid 'NaN')."""
    if isinstance(o, dict):
        return {k: _sanitize(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_sanitize(v) for v in o]
    if isinstance(o, float) and not np.isfinite(o):
        return None
    return o


def dumps(payload):
    return json.dumps(_sanitize(payload), default=_np_default)


# --------------------------------------------------------------------------
# server
# --------------------------------------------------------------------------

class Session:
    """One training run bound to one websocket connection."""

    def __init__(self, ws, loop):
        self.ws = ws
        self.loop = loop
        self.queue = asyncio.Queue(maxsize=256)  # backpressure for the trainer
        self.stop_event = threading.Event()
        self.thread = None
        self.sender_task = None

    def start(self, config):
        stream_opts = {
            "include_explored_cells": bool(config.pop("include_explored_cells", True)),
            "stream_every": int(config.pop("stream_every", 1)),
        }
        max_iterations = config.pop("max_iterations", None)
        args = build_args(**config)

        def emit(payload):
            # blocks the training thread when the queue is full
            asyncio.run_coroutine_threadsafe(self.queue.put(payload), self.loop).result()

        def work():
            try:
                streamer = TrainingStreamer(args, emit=emit,
                                            stop_event=self.stop_event, **stream_opts)
                streamer.run(max_iterations=max_iterations)
            except StopTraining:
                emit({"type": "stopped", "global_step": streamer.trainer.global_step})
            except Exception as e:  # noqa: BLE001
                try:
                    emit({"type": "error", "message": f"{type(e).__name__}: {e}"})
                except Exception:
                    pass
            finally:
                asyncio.run_coroutine_threadsafe(self.queue.put(None), self.loop)

        self.thread = threading.Thread(target=work, daemon=True)
        self.thread.start()
        self.sender_task = asyncio.create_task(self._sender())
        return args

    async def _sender(self):
        while True:
            payload = await self.queue.get()
            if payload is None:
                break
            try:
                await self.ws.send(dumps(payload))
            except websockets.ConnectionClosed:
                self.stop_event.set()
                break

    def stop(self):
        self.stop_event.set()

    @property
    def running(self):
        return self.thread is not None and self.thread.is_alive()


async def handler(ws):
    loop = asyncio.get_running_loop()
    session = None
    print(f"[server] client connected: {ws.remote_address}")
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send(dumps({"type": "error", "message": "invalid JSON"}))
                continue

            cmd = msg.get("cmd")
            if cmd == "start":
                if session and session.running:
                    await ws.send(dumps(
                        {"type": "error", "message": "training already running"}))
                    continue
                config = msg.get("config", {}) or {}
                session = Session(ws, loop)
                try:
                    args = session.start(dict(config))
                except (AttributeError, ValueError, TypeError) as e:
                    await ws.send(dumps(
                        {"type": "error", "message": f"bad config: {e}"}))
                    session = None
                    continue
                await ws.send(dumps({
                    "type": "started",
                    "config": {k: v for k, v in vars(args).items()
                               if isinstance(v, (int, float, str, bool, list, dict))},
                }))
            elif cmd == "stop":
                if session:
                    session.stop()
                    await ws.send(dumps({"type": "stopping"}))
                else:
                    await ws.send(dumps(
                        {"type": "error", "message": "nothing to stop"}))
            else:
                await ws.send(dumps(
                    {"type": "error", "message": f"unknown cmd: {cmd}"}))
    finally:
        if session:
            session.stop()
        print(f"[server] client disconnected: {ws.remote_address}")


async def main(host, port):
    async with websockets.serve(handler, host, port, max_size=None):
        print(f"[server] listening on ws://{host}:{port}")
        await asyncio.Future()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=8765)
    a = p.parse_args()
    asyncio.run(main(a.host, a.port))