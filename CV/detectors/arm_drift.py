"""NIHSS Motor Arm (#5) — active pronator drift test.

Demonstrator holds a frontal-camera-friendly T-pose: both arms extended
horizontally to the sides, wrists near shoulder height, elbows straight.
After a 1 s lock-in (initial pose must be symmetric and stable), the
detector watches up to 10 s for one wrist to drop relative to the other.

All image-space thresholds are normalized by torso length so the test
behaves the same at any camera distance.
"""
from __future__ import annotations

import time

import numpy as np

from detectors.base import (
    Detection,
    L_ELBOW,
    L_HIP,
    L_SHOULDER,
    L_WRIST,
    R_ELBOW,
    R_HIP,
    R_SHOULDER,
    R_WRIST,
    torso_length_image,
    visibility_ok,
)

_POSE_LANDMARKS = (
    L_SHOULDER, R_SHOULDER,
    L_ELBOW, R_ELBOW,
    L_WRIST, R_WRIST,
    L_HIP, R_HIP,
)


class ArmDriftDetector:
    def __init__(self, fps: int = 30):
        self.fps = fps

        # Pose gating (normalized to torso length).
        self.visibility_threshold = 0.7
        self.wrist_height_tol = 0.18      # |wrist.y - shoulder.y| <= this * torso
        self.elbow_straight_deg = 150.0
        self.lateral_min = 0.55           # |wrist.x - shoulder.x| >= this * torso

        # Test timing.
        self.lock_in_sec = 1.0
        self.min_test_sec = 3.0
        self.max_test_sec = 10.0

        # Drift thresholds (normalized to torso).
        self.symmetric_tol = 0.06          # max initial wrist-height asym to lock in
        self.drift_threshold = 0.22        # one wrist drops this fraction of torso

        self.state: str = "idle"           # idle | locking | testing
        self.lock_start_ts: float = 0.0
        self.test_start_ts: float = 0.0
        self.initial_left_drop: float = 0.0
        self.initial_right_drop: float = 0.0

    # ── pose checks ──────────────────────────────────────────────
    @staticmethod
    def _angle(a, b, c) -> float:
        """Angle ABC in degrees using image-space x,y."""
        ba = np.array([a.x - b.x, a.y - b.y])
        bc = np.array([c.x - b.x, c.y - b.y])
        nba = float(np.linalg.norm(ba))
        nbc = float(np.linalg.norm(bc))
        if nba == 0.0 or nbc == 0.0:
            return 0.0
        cos = float(np.clip(np.dot(ba, bc) / (nba * nbc), -1.0, 1.0))
        return float(np.degrees(np.arccos(cos)))

    def _in_test_pose(self, lms, torso: float) -> bool:
        """Strict gate used to ENTER the test: both wrists symmetric at
        shoulder height, elbows straight, arms laterally extended."""
        ls = lms[L_SHOULDER]; rs = lms[R_SHOULDER]
        le = lms[L_ELBOW];   re = lms[R_ELBOW]
        lw = lms[L_WRIST];   rw = lms[R_WRIST]

        wrist_height = (
            abs(lw.y - ls.y) < self.wrist_height_tol * torso
            and abs(rw.y - rs.y) < self.wrist_height_tol * torso
        )
        elbow_straight = (
            self._angle(ls, le, lw) > self.elbow_straight_deg
            and self._angle(rs, re, rw) > self.elbow_straight_deg
        )
        left_lat = (lw.x - ls.x)
        right_lat = (rw.x - rs.x)
        lateral_extend = (
            abs(left_lat) > self.lateral_min * torso
            and abs(right_lat) > self.lateral_min * torso
            and np.sign(left_lat) != np.sign(right_lat)
        )
        return bool(wrist_height and elbow_straight and lateral_extend)

    def _pose_valid_during_test(self, lms, torso: float) -> bool:
        """Loose gate used WHILE testing: arms still laterally extended on
        opposite sides and wrists not raised above shoulders. The whole
        point of the test is to allow one wrist to drop, so we permit it."""
        ls = lms[L_SHOULDER]; rs = lms[R_SHOULDER]
        lw = lms[L_WRIST];   rw = lms[R_WRIST]
        # Wrist must not jerk back up above shoulder line (subject reset).
        if (lw.y - ls.y) < -0.05 * torso or (rw.y - rs.y) < -0.05 * torso:
            return False
        left_lat = (lw.x - ls.x)
        right_lat = (rw.x - rs.x)
        # Loosened lateral threshold; arms may sag inward slightly.
        if not (
            abs(left_lat) > 0.35 * torso
            and abs(right_lat) > 0.35 * torso
            and np.sign(left_lat) != np.sign(right_lat)
        ):
            return False
        return True

    # ── main entry ───────────────────────────────────────────────
    def detect(self, lm_image, lm_world, fps: int) -> Detection | None:
        if not visibility_ok(lm_image, _POSE_LANDMARKS, self.visibility_threshold):
            self.state = "idle"
            return None
        torso = torso_length_image(lm_image)
        if torso < 0.08:
            self.state = "idle"
            return None
        if self.state == "testing":
            if not self._pose_valid_during_test(lm_image, torso):
                self.state = "idle"
                return None
        else:
            if not self._in_test_pose(lm_image, torso):
                self.state = "idle"
                return None

        ls = lm_image[L_SHOULDER]; rs = lm_image[R_SHOULDER]
        lw = lm_image[L_WRIST];   rw = lm_image[R_WRIST]
        # Drop relative to same-side shoulder (image Y grows downward).
        left_drop = float((lw.y - ls.y) / torso)
        right_drop = float((rw.y - rs.y) / torso)
        asym = abs(left_drop - right_drop)
        now = time.time()

        if self.state == "idle":
            self.state = "locking"
            self.lock_start_ts = now
            self.initial_left_drop = left_drop
            self.initial_right_drop = right_drop
            return None

        if self.state == "locking":
            if asym > self.symmetric_tol:
                self.lock_start_ts = now
                self.initial_left_drop = left_drop
                self.initial_right_drop = right_drop
                return None
            if now - self.lock_start_ts < self.lock_in_sec:
                return None
            self.state = "testing"
            self.test_start_ts = now
            self.initial_left_drop = left_drop
            self.initial_right_drop = right_drop
            return None

        # state == "testing"
        elapsed = now - self.test_start_ts
        left_change = left_drop - self.initial_left_drop
        right_change = right_drop - self.initial_right_drop
        # Drift = how much further one wrist dropped vs the other since lock-in.
        drift = float(abs(left_change - right_change))

        if elapsed >= self.min_test_sec and drift > self.drift_threshold:
            dropped_side = "left" if left_change > right_change else "right"
            self.state = "idle"
            return Detection(
                state="ARM_DRIFT",
                features={
                    "dropped_side": dropped_side,
                    "drift": round(drift, 3),
                    "left_change": round(left_change, 3),
                    "right_change": round(right_change, 3),
                    "test_duration_sec": round(elapsed, 1),
                },
            )

        if elapsed > self.max_test_sec:
            self.state = "idle"
        return None

    # ── UI helper ────────────────────────────────────────────────
    def progress(self) -> tuple[str, float, float] | None:
        """Returns (phase, elapsed_sec, total_sec) for HUD overlay."""
        now = time.time()
        if self.state == "locking":
            return ("locking", now - self.lock_start_ts, self.lock_in_sec)
        if self.state == "testing":
            return ("testing", now - self.test_start_ts, self.max_test_sec)
        return None

    @property
    def busy(self) -> bool:
        return self.state != "idle"
