"""Passive hemiplegic posturing detector.

Fires when a still subject shows sustained left-right asymmetry that
suggests unilateral weakness:
- one shoulder lower than the other, and / or
- one wrist hanging lower than the other on the same side,
- with the head tilted toward the weak side (optional reinforcement).

Strict gating to avoid false positives during everyday motion:
- subject must be relatively still (low std-dev of shoulder midpoint),
- both wrists must be in a hanging position (not raised/T-pose),
- the asymmetry must persist for several seconds.
"""
from __future__ import annotations

import collections
import time

import numpy as np

from detectors.base import (
    Detection,
    L_EAR,
    L_HIP,
    L_SHOULDER,
    L_WRIST,
    R_EAR,
    R_HIP,
    R_SHOULDER,
    R_WRIST,
    torso_length_image,
    visibility_ok,
)

# Ears are NOT required (head tilt is just a feature, not a gate).
# Requiring them would silently drop the detector whenever the subject
# turns their head, which is a common false-negative on stage.
_REQUIRED = (
    L_SHOULDER, R_SHOULDER,
    L_WRIST, R_WRIST,
    L_HIP, R_HIP,
)


class PosturalAsymmetryDetector:
    def __init__(self, fps: int = 30):
        self.fps = fps
        self.window_sec = 2.0
        self.sustain_sec = 2.0
        self.motion_window_sec = 0.7

        # Torso-normalized thresholds (fraction of shoulder-to-hip distance).
        # Tuned on a real webcam: a visually obvious shoulder drop is ~8 %
        # of torso length, not 15 %.
        self.shoulder_asym_threshold = 0.08
        self.wrist_asym_threshold = 0.25
        self.head_tilt_deg_threshold = 8.0
        self.hanging_min = 0.15            # wrist at least 15 % torso below shoulder
        self.motion_threshold = 0.018      # std-dev of shoulder midpoint over window

        self.visibility_threshold = 0.55
        self.min_torso = 0.06

        n_window = max(2, int(self.fps * self.window_sec))
        n_motion = max(2, int(self.fps * self.motion_window_sec))

        self.shoulder_asym_hist: collections.deque[float] = collections.deque(
            maxlen=n_window,
        )
        self.wrist_asym_hist: collections.deque[float] = collections.deque(
            maxlen=n_window,
        )
        self.head_tilt_hist: collections.deque[float] = collections.deque(
            maxlen=n_window,
        )
        self.shoulder_mid_x_hist: collections.deque[float] = collections.deque(
            maxlen=n_motion,
        )
        self.shoulder_mid_y_hist: collections.deque[float] = collections.deque(
            maxlen=n_motion,
        )
        self.first_sustained_ts: float | None = None

    def _reset_sustain(self) -> None:
        self.first_sustained_ts = None

    def detect(self, lm_image, lm_world, fps: int) -> Detection | None:
        if not visibility_ok(lm_image, _REQUIRED, self.visibility_threshold):
            self._reset_sustain()
            return None
        torso = torso_length_image(lm_image)
        if torso < self.min_torso:
            self._reset_sustain()
            return None

        ls = lm_image[L_SHOULDER]; rs = lm_image[R_SHOULDER]
        lw = lm_image[L_WRIST];   rw = lm_image[R_WRIST]
        # Ears may not be visible (head turned); compute tilt only if both
        # are reliable.
        try:
            le = lm_image[L_EAR]; re = lm_image[R_EAR]
            ears_visible = (
                le.visibility >= self.visibility_threshold
                and re.visibility >= self.visibility_threshold
            )
        except (IndexError, AttributeError):
            ears_visible = False

        sh_mid_x = (ls.x + rs.x) / 2
        sh_mid_y = (ls.y + rs.y) / 2
        self.shoulder_mid_x_hist.append(sh_mid_x)
        self.shoulder_mid_y_hist.append(sh_mid_y)

        if len(self.shoulder_mid_x_hist) >= self.shoulder_mid_x_hist.maxlen:
            motion = float(np.hypot(
                np.std(self.shoulder_mid_x_hist),
                np.std(self.shoulder_mid_y_hist),
            ))
        else:
            motion = 0.0
        is_still = motion < self.motion_threshold

        # Require both wrists in a hanging position (rules out raised arms,
        # T-pose, hands-on-hips, etc.).
        left_hanging = (lw.y - ls.y) > self.hanging_min * torso
        right_hanging = (rw.y - rs.y) > self.hanging_min * torso
        if not (left_hanging and right_hanging):
            self._reset_sustain()
            return None

        shoulder_asym = float((ls.y - rs.y) / torso)   # positive => left lower
        wrist_asym = float((lw.y - rw.y) / torso)
        if ears_visible:
            head_tilt_deg = float(np.degrees(np.arctan2(
                re.y - le.y, re.x - le.x + 1e-6,
            )))
        else:
            head_tilt_deg = 0.0

        self.shoulder_asym_hist.append(shoulder_asym)
        self.wrist_asym_hist.append(wrist_asym)
        self.head_tilt_hist.append(head_tilt_deg)

        if not is_still or len(self.shoulder_asym_hist) < self.shoulder_asym_hist.maxlen:
            self._reset_sustain()
            return None

        med_sh = float(np.median(self.shoulder_asym_hist))
        med_wr = float(np.median(self.wrist_asym_hist))
        med_tilt = float(np.median(self.head_tilt_hist))

        shoulder_ok = abs(med_sh) > self.shoulder_asym_threshold
        wrist_ok = abs(med_wr) > self.wrist_asym_threshold
        if not (shoulder_ok or wrist_ok):
            self._reset_sustain()
            return None

        # Pick affected side from whichever channel is more decisive.
        if shoulder_ok and wrist_ok:
            sign = np.sign(med_sh + med_wr)
        elif shoulder_ok:
            sign = np.sign(med_sh)
        else:
            sign = np.sign(med_wr)
        affected = "left" if sign > 0 else "right"

        now = time.time()
        if self.first_sustained_ts is None:
            self.first_sustained_ts = now
            return None
        if now - self.first_sustained_ts < self.sustain_sec:
            return None

        return Detection(
            state="POSTURAL_ASYMMETRY",
            features={
                "affected_side": affected,
                "shoulder_asym": round(med_sh, 3),
                "wrist_asym": round(med_wr, 3),
                "head_tilt_deg": round(med_tilt, 1),
                "sustained_sec": round(now - self.first_sustained_ts, 1),
                "motion": round(motion, 4),
            },
        )
