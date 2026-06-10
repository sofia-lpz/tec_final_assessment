from collections import deque
import numpy as np


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

    def update(self, it, broadcast_rate, annihilations):
        self.ema = (broadcast_rate if self.ema is None
                    else self.beta * self.ema + (1 - self.beta) * broadcast_rate)
        self.peak = max(self.peak, self.ema)
        collapsed = self.peak >= self.peak_thr and self.ema <= self.rel_drop * self.peak
        silent_now = (self.ema < self.sil_thr) or collapsed
        self.silent_streak = self.silent_streak + 1 if silent_now else 0
        self.recent_ann.extend(annihilations)

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
