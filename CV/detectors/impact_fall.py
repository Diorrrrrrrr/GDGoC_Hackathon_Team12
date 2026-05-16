"""Sudden impact-fall detector.

Tracks trunk angle (hip -> shoulder vector vs. vertical) over a 0.5 s
window. A genuine fall sweeps the trunk past 45 deg within half a second
and lands the body roughly horizontal (>= 60 deg). Recovery requires the
subject to remain upright for 2 s to avoid flicker between FALLEN and
NORMAL while they thrash.
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


class ImpactFallDetector:
    def __init__(self, fps: int = 30):
        self.fps = fps
        window = max(2, int(fps * 0.5))
        self.angle_history: collections.deque[float] = collections.deque(maxlen=window)

        self.delta_threshold = 45.0
        self.final_angle_threshold = 60.0
        self.recovery_threshold = 35.0
        self.recovery_hold_sec = 2.0
        self.recovery_buffer: collections.deque[float] = collections.deque(
            maxlen=max(2, int(fps * self.recovery_hold_sec)),
        )
        self.is_fallen = False
        self.visibility_threshold = 0.5

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

        self.angle_history.append(body_angle)

        if self.is_fallen:
            self.recovery_buffer.append(body_angle)
            buf_full = len(self.recovery_buffer) >= self.recovery_buffer.maxlen
            if buf_full and max(self.recovery_buffer) < self.recovery_threshold:
                self.is_fallen = False
                self.recovery_buffer.clear()
                self.angle_history.clear()
                return None
            return Detection(
                state="FALLEN",
                features={"body_angle_deg": round(body_angle, 1)},
            )

        if len(self.angle_history) < self.angle_history.maxlen:
            return None

        delta = self.angle_history[-1] - self.angle_history[0]
        if delta > self.delta_threshold and body_angle > self.final_angle_threshold:
            self.is_fallen = True
            self.recovery_buffer.clear()
            return Detection(
                state="IMPACT_FALL",
                features={
                    "body_angle_deg": round(body_angle, 1),
                    "delta_angle_500ms": round(float(delta), 1),
                },
            )
        return None
