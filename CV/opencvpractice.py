import os
import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import time
import requests
import urllib.request

# ── Safe Model Loader (Handles Network Failures) ─────────────────
MODEL_URL  = "https://googleapis.com"
MODEL_PATH = "pose_landmarker_lite.task"

# Only download if the file is missing locally
if not os.path.exists(MODEL_PATH):
    print(f"Model file '{MODEL_PATH}' not found locally. Attempting download...")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("Download successful.")
    except Exception as e:
        print("\n" + "="*60)
        print("NETWORK ERROR: Could not reach Google servers to download the model.")
        print(f"Details: {e}")
        print("-"*60)
        print("FIX: Please download the model manually via your browser from this URL:")
        print(MODEL_URL)
        print(f"Then place the downloaded file exactly here: /Users/mayukaneko/{MODEL_PATH}")
        print("="*60 + "\n")
        exit(1)
else:
    print(f"Cached local model found at '{MODEL_PATH}'. Skipping download safely.")

# ── Tasks API aliases ─────────────────────────────────────────────
BaseOptions          = mp.tasks.BaseOptions
PoseLandmarker       = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions= mp.tasks.vision.PoseLandmarkerOptions
PoseLandmarkerResult = mp.tasks.vision.PoseLandmarkerResult
VisionRunningMode    = mp.tasks.vision.RunningMode

# ── MediaPipe Pose Connections Map ────────────────────────────────
POSE_CONNECTIONS = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16), # Upper body
    (11, 23), (12, 24), (23, 24),                     # Torso
    (23, 25), (25, 27), (24, 26), (26, 28),           # Legs
    (27, 31), (28, 32), (27, 29), (28, 30)            # Feet
]

# ── Shared state (callback writes, main loop reads) ───────────────
latest_result = {"result": None}

def on_result(result: PoseLandmarkerResult, output_image: mp.Image, timestamp_ms: int):
    latest_result["result"] = result   # non-blocking callback

# ── Options ───────────────────────────────────────────────────────
options = PoseLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=VisionRunningMode.LIVE_STREAM,
    num_poses=1,
    min_pose_detection_confidence=0.5,
    min_pose_presence_confidence=0.5,
    min_tracking_confidence=0.5,
    result_callback=on_result
)

# ── Symptom Detection (using WorldLandmarks = real meters) ────────
def detect_symptoms_world(world_landmarks):
    """
    Evaluates real-world dimensions (meters).
    Returns BOTH the true/false symptoms and the raw metric values.
    """
    lm = world_landmarks

    L_SHOULDER = 11; R_SHOULDER = 12
    L_HIP = 23;      R_HIP = 24
    NOSE = 0

    # Metrics
    # lateral sway: shoulder midpoint x-deviation (meters)
    shoulder_mid_x = (lm[L_SHOULDER].x + lm[R_SHOULDER].x) / 2
    hip_mid_x      = (lm[L_HIP].x      + lm[R_HIP].x)      / 2
    sway_m         = abs(shoulder_mid_x - hip_mid_x)

    # body tilt angle from vertical (degrees)
    dy = (lm[L_HIP].y + lm[R_HIP].y)/2 - (lm[L_SHOULDER].y + lm[R_SHOULDER].y)/2
    dz = (lm[L_HIP].z + lm[R_HIP].z)/2 - (lm[L_SHOULDER].z + lm[R_SHOULDER].z)/2
    body_angle_deg = abs(np.degrees(np.arctan2(dz, dy)))

    # shoulder tilt = left/right lean in meters
    shoulder_tilt_m = abs(lm[L_SHOULDER].y - lm[R_SHOULDER].y)

    metrics = {
        "sway_meters":      round(sway_m, 4),
        "body_angle_deg":   round(body_angle_deg, 2),
        "shoulder_tilt_m":  round(shoulder_tilt_m, 4),
    }

    symptoms = {
        "swaying":       bool(sway_m > 0.05),           # >5cm
        "lying_down":    bool(body_angle_deg > 60),     # >60 degrees
        "leaning":       bool(shoulder_tilt_m > 0.08),  # >8cm
        "possible_fall": bool(body_angle_deg > 45 and lm[NOSE].y > 0.3),
    }

    return symptoms, metrics  

def build_payload(symptoms):
    """Formats symptoms into your exact target JSON payload schema."""
    from datetime import datetime, timezone, timedelta
    
    # ISO 8601 Timestamp with +09:00 timezone offset
    tz_offset = timezone(timedelta(hours=9))
    current_time_str = datetime.now(tz_offset).isoformat(timespec='seconds')

    active_count = sum(1 for v in symptoms.values() if v)
    
    if symptoms["possible_fall"] or symptoms["lying_down"]:
        overall_severity = "high"
        risk_score = 0.90
        alert_type = "possible_heat_stress"
    elif active_count >= 2:
        overall_severity = "high"
        risk_score = 0.76
        alert_type = "possible_heat_stress"
    elif active_count == 1:
        overall_severity = "medium"
        risk_score = 0.45
        alert_type = "alert_warning"
    else:
        overall_severity = "low"
        risk_score = 0.10
        alert_type = "normal_monitoring"

    return {
        "user_id": "user01",
        "timestamp": current_time_str,
        "alert_type": alert_type,
        "overall_severity": overall_severity,
        "risk_score": risk_score,
        "features": symptoms  
    }

def draw_skeleton(img, result):
    """Draws points and links using native OpenCV tools."""
    h, w, _ = img.shape
    for pose_lms in result.pose_landmarks:
        points = {}
        for idx, lm in enumerate(pose_lms):
            if lm.visibility > 0.5:
                points[idx] = (int(lm.x * w), int(lm.y * h))

        # skeleton
        for start_idx, end_idx in POSE_CONNECTIONS:
            if start_idx in points and end_idx in points:
                cv2.line(img, points[start_idx], points[end_idx], (255, 0, 0), 2)

        #join nodes
        for idx, pt in points.items():
            cv2.circle(img, pt, 4, (0, 255, 0), -1)


# main
BACKEND_URL   = "http://localhost:8000/analyze"
send_interval = 0.2
last_sent     = 0

cap = cv2.VideoCapture(0, cv2.CAP_AVFOUNDATION)
cap.set(3, 640)
cap.set(4, 480)

with PoseLandmarker.create_from_options(options) as landmarker:
    while True:
        success, img = cap.read()
        if not success:
            break

        # Convert BGR → RGB → MediaPipe Image
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        timestamp_ms = int(time.time() * 1000)
        landmarker.detect_async(mp_image, timestamp_ms)

        result = latest_result["result"]
        if result and result.pose_landmarks:
            draw_skeleton(img, result)

            world_lms = result.pose_world_landmarks[0]
            symptoms, metrics = detect_symptoms_world(world_lms)

            print(f"Sway: {metrics['sway_meters']}m, Angle: {metrics['body_angle_deg']}°")

            # overlay
            active = [k for k, v in symptoms.items() if v]
            for i, label in enumerate(active):
                cv2.putText(img, f"! {label.upper()}", (10, 30 + i*30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0,0,255), 2)

            # send to backend
            now = time.time()
            if now - last_sent >= send_interval:
                payload = build_payload(symptoms)
                try:
                    requests.post(BACKEND_URL, json=payload, timeout=0.5)
                except Exception as e:
                    print(f"Backend error: {e}")
                last_sent = now

        cv2.imshow("Health Monitor", img)
        if cv2.waitKey(1) == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
