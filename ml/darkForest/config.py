import argparse
import os
import random
import time

import numpy as np
import torch
from rewards import *

def parse_args(argv=None):
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
    p.add_argument("--width", type=int, default=20)
    p.add_argument("--height", type=int, default=20)
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
    return p.parse_args(argv)


def get_config(argv=None):

    args = parse_args(argv)

    # --reward key=value pairs -> dict
    args.reward_weights = {}
    for kv in args.reward:
        k, v = kv.split("=")
        args.reward_weights[k.strip()] = float(v)

    # device resolution
    if args.device == "auto":
        args.device = "cuda" if torch.cuda.is_available() else "cpu"

    # run naming
    args.run_name = (args.run_name
                     or f"darkforest_torchrl_{args.critic}_{int(time.time())}")
    args.run_dir = os.path.join("runs", args.run_name)

    return args


def seed_everything(args):
    """Seed python, numpy and torch RNGs from ``args.seed``."""
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.backends.cudnn.deterministic = args.torch_deterministic