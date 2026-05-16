from dataclasses import dataclass, field
from typing import Any, Literal

State = Literal[
    "NORMAL",
    "POSTURAL_ASYMMETRY",
    "ARM_DRIFT",
    "SLOW_SLUMP",
    "IMPACT_FALL",
    "FALLEN",
]


@dataclass
class Detection:
    state: State
    features: dict[str, Any] = field(default_factory=dict)

    @property
    def is_alert(self) -> bool:
        return self.state != "NORMAL"


SEVERITY: dict[str, str] = {
    "NORMAL": "low",
    "POSTURAL_ASYMMETRY": "medium",
    "ARM_DRIFT": "high",
    "SLOW_SLUMP": "high",
    "IMPACT_FALL": "high",
    "FALLEN": "high",
}

RISK_SCORE: dict[str, float] = {
    "NORMAL": 0.05,
    "POSTURAL_ASYMMETRY": 0.55,
    "ARM_DRIFT": 0.85,
    "SLOW_SLUMP": 0.90,
    "IMPACT_FALL": 0.95,
    "FALLEN": 0.95,
}

# MediaPipe BlazePose 33-keypoint indices (subject anatomy).
NOSE = 0
L_EAR, R_EAR = 7, 8
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28


def torso_length_image(lm_image) -> float:
    """Vertical distance from shoulder midpoint to hip midpoint in image-Y.

    Used to normalize image-space thresholds against subject scale so the
    same detector works at different camera distances.
    """
    try:
        sy = (lm_image[L_SHOULDER].y + lm_image[R_SHOULDER].y) / 2
        hy = (lm_image[L_HIP].y + lm_image[R_HIP].y) / 2
    except (IndexError, AttributeError):
        return 0.0
    return float(abs(hy - sy))


def visibility_ok(lms, indices, threshold: float) -> bool:
    for i in indices:
        try:
            if lms[i].visibility < threshold:
                return False
        except (IndexError, AttributeError):
            return False
    return True
