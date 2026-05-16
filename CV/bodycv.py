import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

import cv2
import mediapipe as mp
import requests

from detectors import (
    RISK_SCORE,
    SEVERITY,
    ArmDriftDetector,
    Detection,
    ImpactFallDetector,
    PosturalAsymmetryDetector,
    SlowSlumpDetector,
)

# ── Config (env overrides) ───────────────────────────────────────
BACKEND_URL = os.environ.get(
    "CV_BACKEND_URL",
    "https://gdgoc-hackathon-team12.onrender.com/analyze",
)
USER_ID = os.environ.get("CV_USER_ID", "user01")
CAMERA_INDEX = int(os.environ.get("CV_CAMERA_INDEX", "0"))
HEARTBEAT_SEC = float(os.environ.get("CV_HEARTBEAT_SEC", "300"))
CAM_WIDTH = int(os.environ.get("CV_CAM_WIDTH", "640"))
CAM_HEIGHT = int(os.environ.get("CV_CAM_HEIGHT", "480"))
FPS = 30
KST = timezone(timedelta(hours=9))

# ── MediaPipe model ──────────────────────────────────────────────
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)
MODEL_PATH = os.path.join(os.path.dirname(__file__), "pose_landmarker_lite.task")

if not os.path.exists(MODEL_PATH):
    print(f"Downloading pose model -> {MODEL_PATH}")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    except Exception as e:
        print(f"Failed to download model: {e}", file=sys.stderr)
        sys.exit(1)

BaseOptions = mp.tasks.BaseOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

# VIDEO mode = synchronous detect_for_video(). Each frame's landmarks are
# available in the same loop iteration — no callback latency, no stale
# overlays during fast motion. This is critical for IMPACT_FALL responsiveness.
options = PoseLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=VisionRunningMode.VIDEO,
    num_poses=1,
    min_pose_detection_confidence=0.5,
    min_pose_presence_confidence=0.5,
    min_tracking_confidence=0.5,
)

# ── Skeleton drawing ─────────────────────────────────────────────
POSE_CONNECTIONS = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
    (11, 23), (12, 24), (23, 24),
    (23, 25), (25, 27), (24, 26), (26, 28),
    (27, 31), (28, 32), (27, 29), (28, 30),
]


def draw_skeleton(img, pose_lms):
    h, w, _ = img.shape
    points = {}
    for idx, lm in enumerate(pose_lms):
        if lm.visibility > 0.5:
            points[idx] = (int(lm.x * w), int(lm.y * h))
    for s, e in POSE_CONNECTIONS:
        if s in points and e in points:
            cv2.line(img, points[s], points[e], (255, 0, 0), 2)
    for pt in points.values():
        cv2.circle(img, pt, 4, (0, 255, 0), -1)


def open_camera(index: int):
    if sys.platform == "darwin":
        backends = [cv2.CAP_AVFOUNDATION, cv2.CAP_ANY]
    elif sys.platform == "win32":
        backends = [cv2.CAP_DSHOW, cv2.CAP_ANY]
    else:
        backends = [cv2.CAP_ANY]
    for backend in backends:
        cap = cv2.VideoCapture(index, backend)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAM_WIDTH)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAM_HEIGHT)
            cap.set(cv2.CAP_PROP_FPS, FPS)
            # Minimize buffered frames so we always grab the latest.
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            return cap
    return None


# ── Backend POST ─────────────────────────────────────────────────
def build_payload(state: str, features: dict, *, event_kind: str) -> dict:
    return {
        "user_id": USER_ID,
        "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
        "alert_type": state,
        "overall_severity": SEVERITY.get(state, "low"),
        "risk_score": RISK_SCORE.get(state, 0.05),
        "features": {**features, "event_kind": event_kind},
    }


def post_event(state: str, features: dict, event_kind: str):
    try:
        resp = requests.post(
            BACKEND_URL,
            json=build_payload(state, features, event_kind=event_kind),
            timeout=3.0,
        )
        if resp.status_code >= 400:
            print(
                f"[post_event] {event_kind} {state} -> HTTP {resp.status_code}: "
                f"{resp.text[:200]}",
                file=sys.stderr,
            )
    except requests.RequestException as e:
        print(f"[post_event] {event_kind} {state} failed: {e}", file=sys.stderr)


# ── Detector chain ───────────────────────────────────────────────
# Priority (first to fire wins):
#   SLOW_SLUMP  >  IMPACT_FALL / FALLEN  >  ARM_DRIFT  >  POSTURAL_ASYMMETRY
#
# SlowSlump is checked first so that a progressive slump that ends in a
# final "thud" stays labeled SLOW_SLUMP (clinically: gradual loss of
# consciousness) instead of being reclassified as IMPACT_FALL on the last
# spike. A truly sudden fall is still caught by ImpactFall because the
# SlowSlump max_rate gate (30 deg/s) rejects step changes.
impact_fall_det = ImpactFallDetector(fps=FPS)
slow_slump_det = SlowSlumpDetector(fps=FPS)
arm_drift_det = ArmDriftDetector(fps=FPS)
postural_det = PosturalAsymmetryDetector(fps=FPS)


def step_state(lm_image, lm_world) -> Detection:
    # Latch gate 1: SLOW_SLUMP wins absolutely while sustained, so that a
    # progressive collapse that finishes with a thud stays labeled
    # SLOW_SLUMP and does not get reclassified as IMPACT_FALL.
    if slow_slump_det.is_slumped:
        det = slow_slump_det.detect(lm_image, lm_world, FPS)
        return det if (det is not None and det.is_alert) else Detection(state="NORMAL")

    # Latch gate 2: FALLEN (from ImpactFall) is held until the subject
    # stands back up. SlowSlump is paused so its sliding window cannot
    # combine pre-fall angles with post-fall angles into a fake slope.
    if impact_fall_det.is_fallen:
        slow_slump_det.pause()
        det = impact_fall_det.detect(lm_image, lm_world, FPS)
        return det if (det is not None and det.is_alert) else Detection(state="NORMAL")

    # Normal priority chain (slow_slump before impact_fall so a true
    # progressive slump fires first and engages its own latch).
    for d in (slow_slump_det, impact_fall_det, arm_drift_det):
        det = d.detect(lm_image, lm_world, FPS)
        if det is not None and det.is_alert:
            return det
    # Suppress passive postural detector while the active arm-drift test is
    # in progress; a sagging wrist during the test is the test response, not
    # a separate hemiplegic posture.
    if not arm_drift_det.busy:
        det = postural_det.detect(lm_image, lm_world, FPS)
        if det is not None and det.is_alert:
            return det
    return Detection(state="NORMAL")


# ── Stage HUD ────────────────────────────────────────────────────
STATE_COLORS = {
    "NORMAL": (80, 220, 80),
    "POSTURAL_ASYMMETRY": (0, 165, 255),
    "ARM_DRIFT": (0, 100, 255),
    "SLOW_SLUMP": (40, 40, 230),
    "IMPACT_FALL": (0, 0, 255),
    "FALLEN": (0, 0, 200),
}


def draw_state(img, state: str, features: dict):
    color = STATE_COLORS.get(state, (255, 255, 255))
    cv2.putText(
        img, state.replace("_", " "), (20, 50),
        cv2.FONT_HERSHEY_SIMPLEX, 1.1, color, 3,
    )
    y = 85
    for k, v in features.items():
        if k == "event_kind":
            continue
        cv2.putText(
            img, f"{k}: {v}", (20, y),
            cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1,
        )
        y += 22


def draw_alert_border(img, state: str):
    if state == "NORMAL":
        return
    color = STATE_COLORS.get(state, (0, 0, 255))
    h, w = img.shape[:2]
    cv2.rectangle(img, (0, 0), (w - 1, h - 1), color, 8)


def draw_test_overlay(img):
    progress = arm_drift_det.progress()
    if progress is None:
        return
    phase, elapsed, total = progress
    h, w = img.shape[:2]
    remaining = max(0.0, total - elapsed)
    if phase == "locking":
        msg = f"ARM DRIFT TEST  lock-in: {remaining:0.1f}s"
        bar_col = (200, 200, 0)
    else:
        msg = f"ARM DRIFT TEST  time left: {remaining:0.1f}s"
        bar_col = (0, 200, 255)
    cv2.rectangle(img, (0, h - 45), (w, h), (30, 30, 30), -1)
    cv2.putText(
        img, msg, (15, h - 20),
        cv2.FONT_HERSHEY_SIMPLEX, 0.7, bar_col, 2,
    )
    ratio = 0.0 if total <= 0 else min(1.0, elapsed / total)
    bar_w = int((w - 30) * ratio)
    cv2.rectangle(img, (15, h - 12), (15 + bar_w, h - 6), bar_col, -1)


# ── Main loop ────────────────────────────────────────────────────
last_posted_state: str | None = None
last_posted_features: dict = {}
last_heartbeat_ts: float = 0.0


def main():
    global last_posted_state, last_posted_features, last_heartbeat_ts

    cap = open_camera(CAMERA_INDEX)
    if cap is None:
        print(f"Camera index {CAMERA_INDEX} not available.", file=sys.stderr)
        sys.exit(1)

    print(
        f"CV started ({CAM_WIDTH}x{CAM_HEIGHT} VIDEO mode). "
        f"Backend: {BACKEND_URL}  user_id: {USER_ID}"
    )

    with PoseLandmarker.create_from_options(options) as landmarker:
        while True:
            success, img = cap.read()
            if not success:
                break

            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            ts_ms = int(time.time() * 1000)
            # Synchronous: result is for THIS frame.
            result = landmarker.detect_for_video(mp_image, ts_ms)

            if result.pose_landmarks:
                pose_lms = result.pose_landmarks[0]
                world_lms = result.pose_world_landmarks[0]
                draw_skeleton(img, pose_lms)

                detection = step_state(pose_lms, world_lms)

                now = time.time()
                if detection.state != last_posted_state:
                    post_event(detection.state, detection.features, "transition")
                    last_posted_state = detection.state
                    last_posted_features = detection.features
                    last_heartbeat_ts = now
                elif now - last_heartbeat_ts >= HEARTBEAT_SEC:
                    post_event(
                        last_posted_state or "NORMAL",
                        last_posted_features, "heartbeat",
                    )
                    last_heartbeat_ts = now

                draw_state(img, last_posted_state or "NORMAL", last_posted_features)
                draw_alert_border(img, last_posted_state or "NORMAL")
                draw_test_overlay(img)
            else:
                cv2.putText(
                    img, "no person", (20, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (128, 128, 128), 2,
                )

            cv2.imshow("Stroke Monitor", img)
            if cv2.waitKey(1) == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
