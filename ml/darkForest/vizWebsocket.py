"""
Dark Forest – WebSocket training server.

Streams the FULL simulation state (planets + civilizations + actions) for every
step of a replay episode after each PPO iteration, plus training statistics.

Protocol (client -> server):
  {"cmd": "start", "config": {...}}
      config keys: any train.py / config.py arg (underscores), e.g.
        num_envs, width, height, total_timesteps, names, reward...
      extra keys consumed here (not forwarded to training):
        stream_every   int  emit a replay episode every N iterations (default 1)
        max_iterations int  stop after this many iterations
  {"cmd": "stop"}   abort the current run

Server -> client message types:
  "started"    training begun, echoes resolved config + grid dimensions
  "step"       one simulation step: full board state + actions + rewards
  "episode"    summary sent after the replay episode finishes each iteration
<<<<<<< HEAD
<<<<<<< Updated upstream
  "iteration"  PPO training stats (broadcast rate, losses, survivors, …)
=======
               (meta includes broadcaster_deaths + time_to_annihilation)
  "iteration"  PPO training stats (broadcast rate, losses, entropy, survivors,
               mean per-broadcaster time_to_annihilation: steps from a civ's
               first broadcast to its own death in the replay episode, …)
>>>>>>> Stashed changes
=======
               (meta includes first_broadcast_step + time_to_annihilation)
  "iteration"  PPO training stats (broadcast rate, losses, entropy, survivors,
               time_to_annihilation of this iteration's replay episode, …)
>>>>>>> 004e9f571e90ee785da2e8df60c8bc55ea48e7d7
  "done"       training finished naturally or via dark-forest stopper
  "stopped"    aborted by "stop" command
  "error"      something went wrong

Run:
  python vizWebsocket.py [--host 0.0.0.0] [--port 8765]
"""

import argparse
import asyncio
import json
import os
import sys
import threading
import time
from collections import deque

import numpy as np
import torch
import torch.nn as nn
import websockets

# ── train.py public surface ───────────────────────────────────────────────────
from train import (
    make_torchrl_env,
    build_models,
    record_episode_stream,       # NEW: streams frames live via callback
    A_BROADCAST,
    A_EXPLORE,
    N_NONTARGETED,
)
from config import get_config, seed_everything
from stopper import DarkForestStopper
from rewards import GROUP

try:
    from torchrl.collectors import Collector as SyncDataCollector
except ImportError:
    from torchrl.collectors import SyncDataCollector
from torchrl.data import LazyTensorStorage, ReplayBuffer
from torchrl.data.replay_buffers.samplers import SamplerWithoutReplacement
from torchrl.objectives import ClipPPOLoss, ValueEstimators


# ── JSON helpers ──────────────────────────────────────────────────────────────

def _np_default(o):
    if isinstance(o, np.integer):   return int(o)
    if isinstance(o, np.floating):  return float(o)
    if isinstance(o, np.ndarray):   return o.tolist()
    raise TypeError(f"not JSON serializable: {type(o)}")

def _sanitize(o):
    """Replace NaN/Inf with null so the payload is valid JSON."""
    if isinstance(o, dict):                              return {k: _sanitize(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):                     return [_sanitize(v) for v in o]
    if isinstance(o, float) and not np.isfinite(o):      return None
    return o

def dumps(payload):
    return json.dumps(_sanitize(payload), default=_np_default)


# ── config helpers ────────────────────────────────────────────────────────────

def _build_args(**overrides):
    """Build args from config defaults then apply caller overrides."""
    backup  = sys.argv
    sys.argv = [backup[0]]
    try:
        args = get_config([])
    finally:
        sys.argv = backup
    for k, v in overrides.items():
        if not hasattr(args, k):
            raise AttributeError(f"unknown config key: {k!r}")
        setattr(args, k, v)
    if not getattr(args, "reward_weights", None):
        args.reward_weights = {}
    return args


# ── training loop ─────────────────────────────────────────────────────────────

class StopTraining(Exception):
    pass


def train_with_callbacks(args, on_iteration, stop_event):
    """
    Full PPO loop.  After every update calls:
      on_iteration(stats_dict, policy, action_dim)

    The caller (Session) uses the policy snapshot to run record_episode_stream
    and emit per-step board state over the websocket.
    """
    device = torch.device(args.device)
    os.makedirs(args.run_dir, exist_ok=True)
    seed_everything(args)

    frames_per_batch = args.num_envs * args.num_steps
    num_iters        = max(1, args.total_timesteps // frames_per_batch)
    minibatch_size   = max(1, frames_per_batch // args.num_minibatches)

    env = make_torchrl_env(args, device)
    env.set_seed(args.seed)
    policy, critic, obs_dim, action_dim, n_agents = build_models(args, env, device)

    collector = SyncDataCollector(
        env, policy,
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
        clip_value=args.clip_coef,
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

    optimizer   = torch.optim.Adam(loss_module.parameters(),
                                   lr=args.learning_rate, eps=1e-5)
    stopper     = DarkForestStopper(args)
    return_hist = deque(maxlen=100)
    surv_hist   = deque(maxlen=100)
    global_step = 0
    start_time  = time.time()
    stop_reason = None

    for it, data in enumerate(collector, start=1):
        if stop_event.is_set():
            collector.shutdown()
            raise StopTraining

        global_step += data.numel()

        # LR annealing
        if args.anneal_lr:
            frac = 1.0 - (it - 1) / num_iters
            optimizer.param_groups[0]["lr"] = frac * args.learning_rate

        # Broadcast rate
        alive_mask   = data[GROUP, "mask"]
        actions      = data[GROUP, "action"]
        n_active     = alive_mask.sum().item()
        n_broadcast  = ((actions == A_BROADCAST) & alive_mask).sum().item()
        broadcast_rate = n_broadcast / n_active if n_active > 0 else 0.0

        # Episode bookkeeping
        annihilations = []
        done_root = data["next", "done"].squeeze(-1)
        if done_root.any():
            ep_rew    = data["next", GROUP, "episode_reward"].squeeze(-1)
            next_pop  = data["next", GROUP, "observation", "self"][..., 0]
            next_mask = data["next", GROUP, "mask"]
            for e, t in done_root.nonzero(as_tuple=False).tolist():
                return_hist.append(float(ep_rew[e, t].mean()))
                survivors = int(((next_pop[e, t] > 0) & next_mask[e, t]).sum())
                surv_hist.append(survivors)
                annihilations.append(1.0 if survivors <= 1 else 0.0)

        # GAE
        with torch.no_grad():
            loss_module.value_estimator(
                data,
                params=loss_module.critic_network_params,
                target_params=loss_module.target_critic_network_params,
            )
        adv = data[GROUP, "advantage"] * alive_mask.unsqueeze(-1).to(data[GROUP, "advantage"].dtype)
        data.set((GROUP, "advantage"), adv)

        # PPO update
        replay_buffer.empty()
        replay_buffer.extend(data.reshape(-1))
        last_losses = {}
        approx_kl   = None
        for _ in range(args.update_epochs):
            for _ in range(frames_per_batch // minibatch_size):
                sample    = replay_buffer.sample()
                loss_vals = loss_module(sample)
                loss = (loss_vals["loss_objective"]
                        + loss_vals["loss_critic"]
                        + loss_vals.get("loss_entropy", 0.0))
                optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(loss_module.parameters(), args.max_grad_norm)
                optimizer.step()
                last_losses = {k: float(v.detach().mean())
                               for k, v in loss_vals.items()
                               if k.startswith("loss") or k in ("kl_approx", "entropy")}
                if "kl_approx" in loss_vals.keys():
                    approx_kl = float(loss_vals["kl_approx"].detach())
            if (args.target_kl is not None and approx_kl is not None
                    and approx_kl > args.target_kl):
                break

        mean_ret    = float(np.mean(return_hist)) if return_hist else float("nan")
        mean_surv   = float(np.mean(surv_hist))   if surv_hist   else float("nan")
        elapsed     = time.time() - start_time
        sps         = int(global_step / elapsed) if elapsed > 0 else 0
        current_lr  = optimizer.param_groups[0]["lr"]

        # Raw policy entropy. torchrl >= 0.3 reports it directly in the loss
        # output as "entropy"; older versions only expose
        # loss_entropy = -ent_coef * entropy, so we invert that as a fallback.
        entropy = last_losses.get("entropy")
        if entropy is None:
            ent_loss = last_losses.get("loss_entropy")
            if ent_loss is not None and args.ent_coef > 0:
                entropy = -ent_loss / args.ent_coef

        stop_reason = stopper.update(it, broadcast_rate, annihilations)
        ann         = list(stopper.recent_ann)

        stats = {
            "iteration":           it,
            "num_iters":           num_iters,
            "global_step":         global_step,
            "broadcast_rate":      broadcast_rate,
            "broadcast_ema":       stopper.ema,
            "mean_episode_return": mean_ret,
            "mean_survivors":      mean_surv,
            "value_loss":          last_losses.get("loss_critic"),
            "policy_loss":         last_losses.get("loss_objective"),
            "entropy_loss":        last_losses.get("loss_entropy"),
            "entropy":             entropy,
            "approx_kl":           approx_kl,
            "learning_rate":       current_lr,
            "sps":                 sps,
            "elapsed_seconds":     elapsed,
            "stopper": {
                "mode":              stopper.mode,
                "ema":               stopper.ema,
                "peak":              stopper.peak,
                "silent_streak":     stopper.silent_streak,
                "annihilation_rate": float(np.mean(ann)) if ann else 0.0,
                "episodes_tracked":  len(ann),
            },
            "recent_returns":   [float(r) for r in return_hist],
            "recent_survivors": [float(v) for v in surv_hist],
            "stop_reason":      stop_reason,
        }

        # Pass policy snapshot so the session can run a streaming replay episode
        on_iteration(stats, policy, action_dim)

        if stop_reason:
            break

    collector.shutdown()

    # Checkpoint
    ckpt = os.path.join(args.run_dir, "checkpoint.pt")
    torch.save({"policy": policy.state_dict(), "critic": critic.state_dict(),
                "args": vars(args), "stopped": stop_reason,
                "global_step": global_step}, ckpt)

    # Final render recordings
    for ep in range(args.record_episodes):
        path = os.path.join(args.run_dir, "render", f"final_ep{ep:02d}.json")
        from train import record_episode
        record_episode(policy, args, device, action_dim, path,
                       seed=args.seed + 10_000 + ep,
                       deterministic=args.record_deterministic)
    try:
        env.close()
    except RuntimeError:
        pass

    return stop_reason, global_step


# ── WebSocket session ─────────────────────────────────────────────────────────

class Session:
    def __init__(self, ws, loop):
        self.ws          = ws
        self.loop        = loop
        self.queue       = asyncio.Queue(maxsize=512)
        self.stop_event  = threading.Event()
        self.thread      = None
        self.sender_task = None

    def start(self, config: dict):
        stream_every   = int(config.pop("stream_every",   1))
        max_iterations = config.pop("max_iterations", None)
        args           = _build_args(**config)

        def emit(payload):
            """Send from the training thread into the async queue (blocking on backpressure)."""
            asyncio.run_coroutine_threadsafe(
                self.queue.put(payload), self.loop).result()

        iter_counter = [0]

        def on_iteration(stats, policy, action_dim):
            if self.stop_event.is_set():
                raise StopTraining
            iter_counter[0] += 1
            if max_iterations is not None and iter_counter[0] > max_iterations:
                raise StopTraining

            it = stats["iteration"]

<<<<<<< HEAD
<<<<<<< Updated upstream
=======
            # Per-broadcaster time-to-annihilation for this iteration's
            # replay episode: for each civ, steps from ITS first broadcast to
            # ITS OWN death. The emitted value is the mean over civs that
            # broadcast and then died. None when no replay was streamed this
            # iteration, no one broadcast, or every broadcaster survived
            # ("no signal, no hunter").
            ep_track = {
                "first_broadcast": {},   # name -> step of its first broadcast
                "death_step":      {},   # name -> step its alive flipped False
                "alive_prev":      {},   # name -> alive at previous frame
            }
            time_to_annihilation = None
            broadcaster_deaths = []

>>>>>>> Stashed changes
=======
            # Time-to-annihilation for this iteration's replay episode:
            # steps elapsed between the FIRST broadcast and the end of an
            # episode that ended in annihilation. None when no replay was
            # streamed this iteration, no one broadcast, or everyone survived
            # ("no signal, no hunter").
            ep_track = {"first_broadcast": None}
            time_to_annihilation = None

>>>>>>> 004e9f571e90ee785da2e8df60c8bc55ea48e7d7
            # ── Stream a full replay episode every stream_every iterations ──
            if iter_counter[0] % stream_every == 0:
                episode_seed = args.seed + it

                def on_step(frame):
                    """Called for every simulation step inside record_episode_stream."""
                    if self.stop_event.is_set():
                        raise StopTraining
<<<<<<< HEAD
<<<<<<< Updated upstream
=======
                    step_no = frame["step"]
                    for name, a in frame["actions"].items():
                        if (a and a.get("type") == "broadcast"
                                and name not in ep_track["first_broadcast"]):
                            ep_track["first_broadcast"][name] = step_no
                    for civ in frame["civilizations"]:
                        name = civ["name"]
                        was_alive = ep_track["alive_prev"].get(name, True)
                        if was_alive and not civ["alive"]:
                            ep_track["death_step"][name] = step_no
                        ep_track["alive_prev"][name] = civ["alive"]
>>>>>>> Stashed changes
=======
                    if ep_track["first_broadcast"] is None and any(
                        a and a.get("type") == "broadcast"
                        for a in frame["actions"].values()
                    ):
                        ep_track["first_broadcast"] = frame["step"]
>>>>>>> 004e9f571e90ee785da2e8df60c8bc55ea48e7d7
                    emit({
                        "type":        "step",
                        "iteration":   it,
                        "global_step": stats["global_step"],
                        "grid": {
                            "width":  args.width,
                            "height": args.height,
                        },
                        "agents": args.names,
                        # Full board state:
                        "step":           frame["step"],
                        "planets":        frame["planets"],
                        "civilizations":  frame["civilizations"],
                        "actions":        frame["actions"],
                        "rewards":        frame["rewards"],
                        "terminations":   frame.get("terminations", {}),
                        "truncations":    frame.get("truncations", {}),
                        "episode_done":   frame["episode_done"],
                    })

                device = torch.device(args.device)
                meta = record_episode_stream(
                    policy, args, device, action_dim,
                    on_step=on_step,
                    seed=episode_seed,
                    deterministic=args.record_deterministic,
                )

<<<<<<< HEAD
<<<<<<< Updated upstream
=======
                # A civ counts only if it broadcast and then died.
                for name, fb in ep_track["first_broadcast"].items():
                    death = ep_track["death_step"].get(name)
                    if death is not None and death >= fb:
                        broadcaster_deaths.append({
                            "name":                 name,
                            "first_broadcast_step": fb,
                            "death_step":           death,
                            "steps":                death - fb,
                        })
                if broadcaster_deaths:
                    time_to_annihilation = float(
                        np.mean([d["steps"] for d in broadcaster_deaths]))
                meta["n_broadcasters"]       = len(ep_track["first_broadcast"])
                meta["broadcaster_deaths"]   = broadcaster_deaths
                meta["time_to_annihilation"] = time_to_annihilation

>>>>>>> Stashed changes
=======
                if meta.get("annihilation") and ep_track["first_broadcast"] is not None:
                    time_to_annihilation = (
                        meta["episode_length"] - ep_track["first_broadcast"]
                    )
                meta["first_broadcast_step"] = ep_track["first_broadcast"]
                meta["time_to_annihilation"] = time_to_annihilation

>>>>>>> 004e9f571e90ee785da2e8df60c8bc55ea48e7d7
                # Summary once the episode is finished
                emit({
                    "type":      "episode",
                    "iteration": it,
                    "meta":      meta,
                })

            # ── PPO training stats ──────────────────────────────────────────
<<<<<<< HEAD
<<<<<<< Updated upstream
=======
            stats = dict(stats)
            stats["n_broadcaster_deaths"] = len(broadcaster_deaths)
            stats["time_to_annihilation"] = time_to_annihilation
>>>>>>> Stashed changes
=======
            stats = dict(stats)
            stats["first_broadcast_step"] = ep_track["first_broadcast"]
            stats["time_to_annihilation"] = time_to_annihilation
>>>>>>> 004e9f571e90ee785da2e8df60c8bc55ea48e7d7
            emit({
                "type":        "iteration",
                "iteration":   it,
                "global_step": stats["global_step"],
                "stats":       stats,
                "stop_reason": stats["stop_reason"],
            })

        def work():
            try:
                stop_reason, global_step = train_with_callbacks(
                    args, on_iteration, self.stop_event)
                emit({"type": "done", "iterations": iter_counter[0],
                      "global_step": global_step, "stop_reason": stop_reason})
            except StopTraining:
                emit({"type": "stopped"})
            except Exception as exc:
                try:
                    emit({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
                except Exception:
                    pass
            finally:
                asyncio.run_coroutine_threadsafe(self.queue.put(None), self.loop)

        self.thread      = threading.Thread(target=work, daemon=True)
        self.sender_task = asyncio.create_task(self._sender())
        self.thread.start()
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


# ── WebSocket handler ─────────────────────────────────────────────────────────

async def handler(ws):
    loop    = asyncio.get_running_loop()
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
                    await ws.send(dumps({"type": "error",
                                         "message": "training already running"}))
                    continue
                config  = dict(msg.get("config") or {})
                session = Session(ws, loop)
                try:
                    args = session.start(config)
                except (AttributeError, ValueError, TypeError) as exc:
                    await ws.send(dumps({"type": "error",
                                         "message": f"bad config: {exc}"}))
                    session = None
                    continue
                await ws.send(dumps({
                    "type":   "started",
                    "config": {k: v for k, v in vars(args).items()
                               if isinstance(v, (int, float, str, bool, list, dict))},
                    "grid":   {"width": args.width, "height": args.height},
                    "agents": args.names,
                }))

            elif cmd == "stop":
                if session and session.running:
                    session.stop()
                    await ws.send(dumps({"type": "stopping"}))
                else:
                    await ws.send(dumps({"type": "error",
                                         "message": "nothing to stop"}))
            else:
                await ws.send(dumps({"type": "error",
                                      "message": f"unknown cmd: {cmd!r}"}))
    finally:
        if session:
            session.stop()
        print(f"[server] client disconnected: {ws.remote_address}")


async def _main(host, port):
    async with websockets.serve(handler, host, port, max_size=None):
        print(f"[server] listening on ws://{host}:{port}")
        await asyncio.Future()

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=8765)
    a = p.parse_args()
    asyncio.run(_main(a.host, a.port))