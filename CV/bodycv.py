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

# ── Pose connections ──────────────────────────────────────────────
POSE_CONNECTIONS = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
    (11, 23), (12, 24), (23, 24),
    (23, 25), (25, 27), (24, 26), (26, 28),
    (27, 31), (28, 32), (27, 29), (28, 30)
]

def draw_skeleton(img, result):
    h, w, _ = img.shape
    for pose_lms in result.pose_landmarks:
        points = {}
        for idx, lm in enumerate(pose_lms):
            if lm.visibility > 0.5:
                points[idx] = (int(lm.x * w), int(lm.y * h))
        for start_idx, end_idx in POSE_CONNECTIONS:
            if start_idx in points and end_idx in points:
                cv2.line(img, points[start_idx], points[end_idx], (255, 0, 0), 2)
        for idx, pt in points.items():
            cv2.circle(img, pt, 4, (0, 255, 0), -1)

# sway analyser
sway_analyzer = SwayAnalyzer(fps=30)

# symptom detection 
def detect_symptoms_world(world_landmarks):
    lm = world_landmarks
    L_SHOULDER, R_SHOULDER = 11, 12
    L_HIP, R_HIP           = 23, 24
    NOSE                   = 0

    # 1. SWAY ANALYSIS (Instant + Advanced Patterns)
    is_swaying_now, patterns, sway_metrics = sway_analyzer.update_coordinates(lm)

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
        **patterns
    }

    symptoms = {
        "swaying":        bool(is_swaying_now),
        "stroke_pattern": bool(patterns['stroke_risk']),
        "pattern_type":   patterns['type'],
        "lying_down":     bool(body_angle_deg > 60),
        "leaning":        bool(shoulder_tilt_m > 0.08),
        "possible_fall":  bool(body_angle_deg > 45 and lm[NOSE].y > 0.3),
    }
    
    # Normal is True if none of the above specific symptoms are active
    symptoms["normal"] = not any([
        symptoms["swaying"], 
        symptoms["stroke_pattern"], 
        symptoms["lying_down"], 
        symptoms["leaning"], 
        symptoms["possible_fall"]
    ])

    return symptoms, metrics

def build_payload(symptoms, metrics):
    from datetime import datetime, timezone, timedelta
    tz_offset = timezone(timedelta(hours=9))
    current_time_str = datetime.now(tz_offset).isoformat(timespec='seconds')

    active_count = sum(1 for k, v in symptoms.items() if v and k in ["swaying", "lying_down", "leaning", "possible_fall"])

    if symptoms["stroke_pattern"]:
        overall_severity = "high"
        risk_score       = 0.98
        alert_type       = f"NEURO_PATTERN_{symptoms['pattern_type'].upper()}"
    elif symptoms["possible_fall"] or symptoms["lying_down"]:
        overall_severity = "high"
        risk_score       = 0.90
        alert_type       = "possible_fall"
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
        "features":         symptoms,
        "raw_metrics":      metrics
    }

# main loop
BACKEND_URL   = "http://localhost:8000/analyze"
send_interval = 0.2
last_sent     = 0

cap = cv2.VideoCapture(1, cv2.CAP_AVFOUNDATION)
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
            draw_skeleton(img, result)
            symptoms, metrics = detect_symptoms_world(result.pose_world_landmarks[0])

            # Overlay info (2x bigger)
            if symptoms["normal"]:
                cv2.putText(img, "NORMAL", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.8, (0, 255, 0), 4)
            else:
                # 1. Stroke Pattern Alert (Priority)
                if symptoms["stroke_pattern"]:
                    status_text = f"RISK: {symptoms['pattern_type'].replace('_', ' ').upper()}"
                    cv2.putText(img, status_text, (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 255), 4)
                    y0 = 120
                else:
                    cv2.putText(img, "SYMPTOM DETECTED", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 255), 4)
                    y0 = 120

                # 2. List all active individual symptoms (2x bigger)
                active_symptoms = [k for k, v in symptoms.items() if v and k not in ["normal", "stroke_pattern", "pattern_type"]]
                for i, label in enumerate(active_symptoms):
                    cv2.putText(img, f"! {label.replace('_', ' ').upper()}", (20, y0 + i*60),
                                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)
            
            # Show detail metrics for debugging (at the bottom, 2x bigger)
            if symptoms["stroke_pattern"]:
                h_img = img.shape[0]
                cv2.putText(img, f"Arrhythmia: {metrics.get('arrhythmia_score')}", (20, h_img - 80), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0,165,255), 2)
                cv2.putText(img, f"Escalation: {metrics.get('slope')} m/min", (20, h_img - 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0,165,255), 2)

            # Send payload
            now = time.time()
            if now - last_sent >= send_interval:
                try:
                    requests.post(BACKEND_URL, json=build_payload(symptoms, metrics), timeout=0.5)
                except: pass
                last_sent = now

        cv2.imshow("High-Fidelity Stroke Monitor", img)
        if cv2.waitKey(1) == ord('q'): break

cap.release()
cv2.destroyAllWindows()
