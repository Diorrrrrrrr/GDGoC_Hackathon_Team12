import os
import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import collections
import numpy as np
import time
import requests
import urllib.request

MODEL_URL  = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
MODEL_PATH = "pose_landmarker_lite.task"

if not os.path.exists(MODEL_PATH):
    print(f"Downloading model...")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("Download successful.")
    except Exception as e:
        print(f"NETWORK ERROR: {e}")
        print(f"Download manually from: {MODEL_URL}")
        exit(1)
else:
    print(f"Model found locally. Skipping download.")

BaseOptions           = mp.tasks.BaseOptions
PoseLandmarker        = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
PoseLandmarkerResult  = mp.tasks.vision.PoseLandmarkerResult
VisionRunningMode     = mp.tasks.vision.RunningMode

POSE_CONNECTIONS = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
    (11, 23), (12, 24), (23, 24),
    (23, 25), (25, 27), (24, 26), (26, 28),
    (27, 31), (28, 32), (27, 29), (28, 30)
]

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

SWAY_WINDOW  = 90
sway_history = collections.deque(maxlen=SWAY_WINDOW)

def update_sway_history(lm):
    shoulder_mid_x = (lm[11].x + lm[12].x) / 2
    hip_mid_x      = (lm[23].x + lm[24].x) / 2
    sway_history.append(shoulder_mid_x - hip_mid_x)

def detect_cyclical_sway():
    if len(sway_history) < SWAY_WINDOW // 2:
        return False, {}
    signal = np.array(sway_history)
    signal = signal - np.mean(signal)
    amplitude_m    = float(np.max(signal) - np.min(signal))
    zero_crossings = np.where(np.diff(np.sign(signal)))[0]
    crossing_rate  = len(zero_crossings) / (len(signal) / 30.0)
    fft_vals       = np.abs(np.fft.rfft(signal))
    freqs          = np.fft.rfftfreq(len(signal), d=1/30.0)
    fft_vals[0]    = 0
    dominant_freq  = float(freqs[np.argmax(fft_vals)])
    is_swaying = (
        amplitude_m   >= 0.03        and
        0.8 <= crossing_rate <= 4.0  and
        0.3 <= dominant_freq <= 2.0
    )
    return bool(is_swaying), {
        "sway_amplitude_m":   round(amplitude_m,         4),
        "sway_freq_hz":       round(dominant_freq,        3),
        "sway_crossing_rate": round(float(crossing_rate), 3),
    }

def detect_symptoms_world(world_landmarks):
    lm = world_landmarks
    L_SHOULDER, R_SHOULDER = 11, 12
    L_HIP, R_HIP           = 23, 24
    NOSE                   = 0
    update_sway_history(lm)
    dy = (lm[L_HIP].y + lm[R_HIP].y)/2 - (lm[L_SHOULDER].y + lm[R_SHOULDER].y)/2
    dz = (lm[L_HIP].z + lm[R_HIP].z)/2 - (lm[L_SHOULDER].z + lm[R_SHOULDER].z)/2
    body_angle_deg  = abs(np.degrees(np.arctan2(dz, dy)))
    shoulder_tilt_m = abs(lm[L_SHOULDER].y - lm[R_SHOULDER].y)
    is_swaying, sway_metrics = detect_cyclical_sway()
    metrics = {
        "body_angle_deg":  round(body_angle_deg,  2),
        "shoulder_tilt_m": round(shoulder_tilt_m, 4),
        **sway_metrics,
    }
    symptoms = {
        "normal":        bool(not is_swaying and shoulder_tilt_m < 0.08 and body_angle_deg < 15),
        "swaying":       bool(is_swaying),
        "lying_down":    bool(body_angle_deg > 60),
        "leaning":       bool(shoulder_tilt_m > 0.08),
        "possible_fall": bool(body_angle_deg > 45 and lm[NOSE].y > 0.3),
    }
    return symptoms, metrics

def build_payload(symptoms):
    from datetime import datetime, timezone, timedelta
    tz_offset        = timezone(timedelta(hours=9))
    current_time_str = datetime.now(tz_offset).isoformat(timespec='seconds')
    active_count     = sum(1 for k, v in symptoms.items() if v and k != "normal")
    if symptoms["possible_fall"] or symptoms["lying_down"]:
        overall_severity = "high";   risk_score = 0.90; alert_type = "possible_heat_stress"
    elif active_count >= 2:
        overall_severity = "high";   risk_score = 0.76; alert_type = "possible_heat_stress"
    elif active_count == 1:
        overall_severity = "medium"; risk_score = 0.45; alert_type = "alert_warning"
    else:
        overall_severity = "low";    risk_score = 0.10; alert_type = "normal_monitoring"
    return {
        "user_id": "user01", "timestamp": current_time_str,
        "alert_type": alert_type, "overall_severity": overall_severity,
        "risk_score": risk_score, "features": symptoms
    }

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
        rgb      = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        landmarker.detect_async(mp_image, int(time.time() * 1000))
        result = latest_result["result"]
        if result and result.pose_landmarks:
            draw_skeleton(img, result)
            symptoms, metrics = detect_symptoms_world(result.pose_world_landmarks[0])
            print(f"Angle: {metrics['body_angle_deg']}  Tilt: {metrics['shoulder_tilt_m']}  Sway: {metrics.get('sway_freq_hz','-')}Hz")
            if symptoms["normal"]:
                cv2.putText(img, "NORMAL", (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0,255,0), 2)
            else:
                active = [k for k, v in symptoms.items() if v and k != "normal"]
                for i, label in enumerate(active):
                    cv2.putText(img, f"! {label.upper()}", (10, 30 + i*30), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0,0,255), 2)
            if "sway_freq_hz" in metrics:
                cv2.putText(img, f"sway {metrics['sway_freq_hz']}Hz amp {metrics['sway_amplitude_m']}m",
                    (10, img.shape[0]-15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200,200,0), 1)
            now = time.time()
            if now - last_sent >= send_interval:
                try:
                    requests.post(BACKEND_URL, json=build_payload(symptoms), timeout=0.5)
                except Exception as e:
                    print(f"Backend error: {e}")
                last_sent = now
        else:
            cv2.putText(img, "No person detected", (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (128,128,128), 2)
        cv2.imshow("Health Monitor", img)
        if cv2.waitKey(1) == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()