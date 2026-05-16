import os
import cv2
import mediapipe as mp
import time
import requests
import urllib.request
import numpy as np

# Import the new analyzer
from analyzers.sway import SwayAnalyzer

MODEL_URL  = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "pose_landmarker_lite.task")

if not os.path.exists(MODEL_PATH):
    print(f"Model file '{MODEL_PATH}' not found locally. Attempting download...")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("Download successful.")
    except Exception as e:
        print(f"Error downloading model: {e}")
        exit(1)

# ── Mediapipe Setup ──────────────────────────────────────────────
BaseOptions           = mp.tasks.BaseOptions
PoseLandmarker        = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
PoseLandmarkerResult  = mp.tasks.vision.PoseLandmarkerResult
VisionRunningMode     = mp.tasks.vision.RunningMode

latest_result = {"result": None}

def on_result(result: PoseLandmarkerResult, output_image: mp.Image, timestamp_ms: int):
    latest_result["result"] = result

options = PoseLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=VisionRunningMode.LIVE_STREAM,
    num_poses=1,
    min_pose_detection_confidence=0.5,
    min_pose_presence_confidence=0.5,
    min_tracking_confidence=0.5,
    result_callback=on_result
)

# Initialize Sway Analyzer
sway_analyzer = SwayAnalyzer(fps=30)

# ── Symptom detection ─────────────────────────────────────────────
def detect_symptoms_world(world_landmarks):
    lm = world_landmarks
    L_SHOULDER, R_SHOULDER = 11, 12
    L_HIP, R_HIP           = 23, 24
    NOSE                   = 0

    # 1. SWAY ANALYSIS (Instant + Pattern)
    is_swaying_now, pattern_alert, sway_metrics = sway_analyzer.update_coordinates(lm)

    # 2. BODY TILT (Lying down/leaning)
    dy = (lm[L_HIP].y + lm[R_HIP].y)/2 - (lm[L_SHOULDER].y + lm[R_SHOULDER].y)/2
    dz = (lm[L_HIP].z + lm[R_HIP].z)/2 - (lm[L_SHOULDER].z + lm[R_SHOULDER].z)/2
    body_angle_deg = abs(np.degrees(np.arctan2(dz, dy)))

    # 3. SHOULDER TILT
    shoulder_tilt_m = abs(lm[L_SHOULDER].y - lm[R_SHOULDER].y)

    metrics = {
        "body_angle_deg":  round(body_angle_deg,  2),
        "shoulder_tilt_m": round(shoulder_tilt_m, 4),
        **sway_metrics,
    }

    symptoms = {
        "normal":        bool(not is_swaying_now and not pattern_alert and shoulder_tilt_m < 0.08 and body_angle_deg < 15),
        "swaying":       bool(is_swaying_now),
        "stroke_pattern": bool(pattern_alert), # NEW: Pattern match
        "lying_down":    bool(body_angle_deg > 60),
        "leaning":       bool(shoulder_tilt_m > 0.08),
        "possible_fall": bool(body_angle_deg > 45 and lm[NOSE].y > 0.3),
    }

    return symptoms, metrics

def build_payload(symptoms):
    from datetime import datetime, timezone, timedelta
    tz_offset = timezone(timedelta(hours=9))
    current_time_str = datetime.now(tz_offset).isoformat(timespec='seconds')

    active_count = sum(1 for k, v in symptoms.items() if v and k != "normal")

    # High severity for pattern matches or falls
    if symptoms["stroke_pattern"] or symptoms["possible_fall"] or symptoms["lying_down"]:
        overall_severity = "high"
        risk_score       = 0.95
        alert_type       = "CRITICAL_PATTERN_DETECTED" if symptoms["stroke_pattern"] else "possible_fall"
    elif active_count >= 2:
        overall_severity = "high"
        risk_score       = 0.76
        alert_type       = "multiple_symptoms"
    elif active_count == 1:
        overall_severity = "medium"
        risk_score       = 0.45
        alert_type       = "warning"
    else:
        overall_severity = "low"
        risk_score       = 0.10
        alert_type       = "monitoring"

    return {
        "user_id":          "user01",
        "timestamp":        current_time_str,
        "alert_type":       alert_type,
        "overall_severity": overall_severity,
        "risk_score":       risk_score,
        "features":         symptoms
    }

# ── Main loop ─────────────────────────────────────────────────────
BACKEND_URL   = "http://localhost:8000/analyze"
send_interval = 0.2
last_sent     = 0

cap = cv2.VideoCapture(0, cv2.CAP_AVFOUNDATION)
if not cap.isOpened():
    cap = cv2.VideoCapture(1, cv2.CAP_AVFOUNDATION)

with PoseLandmarker.create_from_options(options) as landmarker:
    while True:
        success, img = cap.read()
        if not success: break

        rgb      = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        landmarker.detect_async(mp_image, int(time.time() * 1000))

        result = latest_result["result"]
        if result and result.pose_landmarks:
            symptoms, metrics = detect_symptoms_world(result.pose_world_landmarks[0])

            # Overlay info
            color = (0, 255, 0) if symptoms["normal"] else (0, 0, 255)
            status_text = "NORMAL" if symptoms["normal"] else "SYMPTOM DETECTED"
            if symptoms["stroke_pattern"]:
                status_text = "!!! STROKE PATTERN !!!"
                color = (0, 0, 255)

            cv2.putText(img, status_text, (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)
            
            # Send payload
            now = time.time()
            if now - last_sent >= send_interval:
                try:
                    requests.post(BACKEND_URL, json=build_payload(symptoms), timeout=0.5)
                except: pass
                last_sent = now

        cv2.imshow("Stroke Detection Monitor", img)
        if cv2.waitKey(1) == ord('q'): break

cap.release()
cv2.destroyAllWindows()
