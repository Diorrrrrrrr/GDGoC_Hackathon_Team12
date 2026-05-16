"""Slow progressive loss-of-consciousness detector.

Tracks trunk tilt (hip -> shoulder vector vs. vertical) over a 10 s
window. A slow slump is distinguished from a sudden impact fall by its
*rate*: 2-30 deg/s of monotonic increase, accumulating to >= 30 deg
final tilt and holding that tilt for several seconds.

Latches into a sustained-slump state once triggered, releasing only when
the subject returns close to upright.
"""
from __future__ import annotations

import collections

import numpy as np

from detectors.base import (
    Detection,
    L_HIP,
    L_SHOULDER,
    R_HIP,
    R_SHOULDER,
    visibility_ok,
)

_REQUIRED = (L_SHOULDER, R_SHOULDER, L_HIP, R_HIP)


class SlowSlumpDetector:
    def __init__(self, fps: int = 30):
        self.fps = fps
        # Tuned for stage demo: ~8-9 s from start of tilt to trigger.
        # max_rate keeps an instantaneous flop from being misclassified as a
        # slump (that path stays with ImpactFallDetector).
        self.window_sec = 7.0
        self.hold_sec = 2.0
        self.min_rate_deg_per_sec = 2.0
        self.max_rate_deg_per_sec = 30.0
        self.min_delta_deg = 18.0
        self.min_final_angle_deg = 25.0
        self.hold_angle_deg = 20.0
        self.recovery_angle_deg = 15.0

        self.visibility_threshold = 0.6

        n_window = max(2, int(self.fps * self.window_sec))
        n_hold = max(2, int(self.fps * self.hold_sec))
        self.angle_hist: collections.deque[float] = collections.deque(maxlen=n_window)
        self.hold_buffer: collections.deque[float] = collections.deque(maxlen=n_hold)
        self.is_slumped = False

    def pause(self) -> None:
        """Clear the slope-fit buffers without changing the latched state.

        Called by the orchestrator when another detector (e.g. FALLEN
        latch) is currently authoritative, so that stale "pre-event"
        angles cannot combine with current "post-event" angles to
        synthesize a spurious 2-30 deg/s slope when this detector
        resumes.
        """
        self.angle_hist.clear()
        self.hold_buffer.clear()

    @staticmethod
    def _body_angle(lm_world) -> float:
        sx = (lm_world[L_SHOULDER].x + lm_world[R_SHOULDER].x) / 2.0
        sy = (lm_world[L_SHOULDER].y + lm_world[R_SHOULDER].y) / 2.0
        sz = (lm_world[L_SHOULDER].z + lm_world[R_SHOULDER].z) / 2.0
        hx = (lm_world[L_HIP].x + lm_world[R_HIP].x) / 2.0
        hy = (lm_world[L_HIP].y + lm_world[R_HIP].y) / 2.0
        hz = (lm_world[L_HIP].z + lm_world[R_HIP].z) / 2.0
        dx = hx - sx
        dy = hy - sy
        dz = hz - sz
        horizontal = float(np.hypot(dx, dz))
        return float(abs(np.degrees(np.arctan2(horizontal, dy))))

    def detect(self, lm_image, lm_world, fps: int) -> Detection | None:
        if not visibility_ok(lm_image, _REQUIRED, self.visibility_threshold):
            return None
        try:
            body_angle = self._body_angle(lm_world)
        except (IndexError, AttributeError):
            return None

        # Sustained / latched state.
        if self.is_slumped:
            if body_angle < self.recovery_angle_deg:
                self.is_slumped = False
                self.angle_hist.clear()
                self.hold_buffer.clear()
                return None
            return Detection(
                state="SLOW_SLUMP",
                features={
                    "final_angle_deg": round(body_angle, 1),
                    "status": "sustained",
                },
            )

        self.angle_hist.append(body_angle)
        self.hold_buffer.append(body_angle)

        if len(self.angle_hist) < self.angle_hist.maxlen:
            return None

        angles = np.asarray(self.angle_hist, dtype=float)
        x_sec = np.arange(len(angles), dtype=float) / float(self.fps)
        slope = float(np.polyfit(x_sec, angles, 1)[0])  # deg / sec

        head_count = min(self.fps, len(angles))
        initial_angle = float(np.mean(angles[:head_count]))
        final_angle = float(np.mean(angles[-head_count:]))
        delta = final_angle - initial_angle

        if not (self.min_rate_deg_per_sec <= slope <= self.max_rate_deg_per_sec):
            return None
        if delta < self.min_delta_deg:
            return None
        if final_angle < self.min_final_angle_deg:
            return None
        if len(self.hold_buffer) < self.hold_buffer.maxlen:
            return None
        if min(self.hold_buffer) < self.hold_angle_deg:
            return None

        self.is_slumped = True
        return Detection(
            state="SLOW_SLUMP",
            features={
                "slump_rate_deg_per_sec": round(slope, 2),
                "final_angle_deg": round(final_angle, 1),
                "delta_angle_deg": round(delta, 1),
                "window_sec": round(self.window_sec, 1),
                "status": "onset",
            },
        )
