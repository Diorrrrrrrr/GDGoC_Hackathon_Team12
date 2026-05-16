import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision


KST = timezone(timedelta(hours=9))
MODEL_PATH = Path(__file__).with_name("face_landmarker.task")

LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
FACE_OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454,
    323, 361, 288, 397, 365, 379, 378, 400,
    377, 152, 148, 176, 149, 150, 136, 172,
    58, 132, 93, 234, 127, 162, 21, 54,
    103, 67, 109,
]


def landmark_to_point(landmark, width, height):
    return int(landmark.x * width), int(landmark.y * height)


def eye_aspect_ratio(points):
    p1, p2, p3, p4, p5, p6 = points
    vertical_1 = np.linalg.norm(np.array(p2) - np.array(p6))
    vertical_2 = np.linalg.norm(np.array(p3) - np.array(p5))
    horizontal = np.linalg.norm(np.array(p1) - np.array(p4))

    if horizontal == 0:
        return 0.0

    return (vertical_1 + vertical_2) / (2.0 * horizontal)


def get_face_mask(frame, landmarks, width, height):
    points = np.array(
        [landmark_to_point(landmarks[index], width, height) for index in FACE_OVAL],
        dtype=np.int32,
    )
    mask = np.zeros(frame.shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [points], 255)
    return mask


def extract_skin_color_features(frame, mask):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    bgr_pixels = frame[mask == 255]
    hsv_pixels = hsv[mask == 255]

    if len(bgr_pixels) == 0:
        return 0.0, 0.0

    blue = bgr_pixels[:, 0].astype(float)
    green = bgr_pixels[:, 1].astype(float)
    red = bgr_pixels[:, 2].astype(float)
    saturation = hsv_pixels[:, 1].astype(float)
    value = hsv_pixels[:, 2].astype(float)

    redness_score = np.mean(red / (green + blue + 1))
    paleness_score = np.mean((value / 255.0) * (1.0 - saturation / 255.0))
    return float(redness_score), float(paleness_score)


def classify_severity(redness, paleness, eye_closure):
    score = 0

    if redness > 0.95:
        score += 2
    elif redness > 0.80:
        score += 1

    if paleness > 0.55:
        score += 2
    elif paleness > 0.45:
        score += 1

    if eye_closure > 0.65:
        score += 2
    elif eye_closure > 0.40:
        score += 1

    if score >= 5:
        return "high"
    if score >= 3:
        return "medium"
    if score >= 1:
        return "low"
    return "normal"


def create_face_landmarker():
    if not MODEL_PATH.exists():
        print("Face Landmarker model not found.")
        print(f"Expected model path: {MODEL_PATH}")
        print(
            "Download a compatible face_landmarker.task model and place it in the workspace root."
        )
        return None

    options = vision.FaceLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return vision.FaceLandmarker.create_from_options(options)


def build_default_output(username):
    return {
        "username": username,
        "timestamp": datetime.now(KST).isoformat(),
        "features": {
            "redness": None,
            "paleness": None,
            "eye_closure_score": None,
        },
        "symptom": "face_not_detected",
        "severity": "unknown",
    }


def draw_detected_face_overlay(frame, redness, paleness, eye_closure_score, severity):
    cv2.putText(
        frame,
        f"Redness: {redness:.3f}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 0, 255),
        2,
    )
    cv2.putText(
        frame,
        f"Paleness: {paleness:.3f}",
        (20, 75),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 255, 255),
        2,
    )
    cv2.putText(
        frame,
        f"Eye Closure: {eye_closure_score:.3f}",
        (20, 110),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 255),
        2,
    )
    cv2.putText(
        frame,
        f"Severity: {severity}",
        (20, 145),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 0),
        2,
    )


def main():
    landmarker = create_face_landmarker()
    if landmarker is None:
        return 1

    camera = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not camera.isOpened():
        print("Could not open webcam.")
        landmarker.close()
        return 1

    print("Webcam started. Press 'q' to quit.")

    username = "test_user"
    last_print_time = time.time()

    try:
        while True:
            ok, frame = camera.read()
            if not ok:
                print("Failed to read frame.")
                return 1

            frame = cv2.flip(frame, 1)
            height, width, _ = frame.shape

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            timestamp_ms = int(time.time() * 1000)
            results = landmarker.detect_for_video(mp_image, timestamp_ms)

            output = build_default_output(username)

            if results.face_landmarks:
                landmarks = results.face_landmarks[0]
                mask = get_face_mask(frame, landmarks, width, height)
                redness, paleness = extract_skin_color_features(frame, mask)

                left_eye_points = [
                    landmark_to_point(landmarks[index], width, height) for index in LEFT_EYE
                ]
                right_eye_points = [
                    landmark_to_point(landmarks[index], width, height) for index in RIGHT_EYE
                ]

                left_ear = eye_aspect_ratio(left_eye_points)
                right_ear = eye_aspect_ratio(right_eye_points)
                average_ear = (left_ear + right_ear) / 2.0
                eye_closure_score = max(0.0, min(1.0, 1.0 - average_ear / 0.30))

                severity = classify_severity(redness, paleness, eye_closure_score)
                symptom = "possible_heatstroke_sign" if severity != "normal" else "none"

                output = {
                    "username": username,
                    "timestamp": datetime.now(KST).isoformat(),
                    "features": {
                        "redness": round(redness, 3),
                        "paleness": round(paleness, 3),
                        "eye_closure_score": round(eye_closure_score, 3),
                    },
                    "symptom": symptom,
                    "severity": severity,
                }

                draw_detected_face_overlay(
                    frame, redness, paleness, eye_closure_score, severity
                )
            else:
                cv2.putText(
                    frame,
                    "Face not detected",
                    (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 0, 255),
                    2,
                )

            if time.time() - last_print_time >= 1:
                print(json.dumps(output, ensure_ascii=False), flush=True)
                last_print_time = time.time()

            cv2.imshow("Face Features Webcam Test", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        camera.release()
        cv2.destroyAllWindows()
        landmarker.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
