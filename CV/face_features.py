import cv2
import json
import time
from datetime import datetime, timedelta, timezone

import numpy as np


KST = timezone(timedelta(hours=9))


def get_timestamp():
    return datetime.now(KST).isoformat()


def extract_face_color_features(frame, face_box):
    x, y, w, h = face_box
    face = frame[y:y + h, x:x + w]

    if face.size == 0:
        return 0.0, 0.0

    hsv = cv2.cvtColor(face, cv2.COLOR_BGR2HSV)
    b = face[:, :, 0].astype(float)
    g = face[:, :, 1].astype(float)
    r = face[:, :, 2].astype(float)
    s = hsv[:, :, 1].astype(float)
    v = hsv[:, :, 2].astype(float)

    redness_score = np.mean(r / (g + b + 1))
    paleness_score = np.mean((v / 255.0) * (1.0 - s / 255.0))
    return float(redness_score), float(paleness_score)


def estimate_eye_openness_from_region(eye_region):
    if eye_region.size == 0:
        return 0.0

    normalized_region = cv2.equalizeHist(eye_region)
    dark_ratio = float(np.mean(normalized_region < 85))
    vertical_gradient = cv2.Sobel(normalized_region, cv2.CV_32F, 0, 1, ksize=3)
    edge_strength = float(np.mean(np.abs(vertical_gradient)) / 255.0)

    openness_from_darkness = np.clip((dark_ratio - 0.12) / 0.22, 0.0, 1.0)
    openness_from_edges = np.clip(edge_strength / 0.18, 0.0, 1.0)
    return float(0.6 * openness_from_darkness + 0.4 * openness_from_edges)


def estimate_eye_closure(frame_gray, face_box, eye_cascade):
    x, y, w, h = face_box
    upper_face = frame_gray[y:y + h // 2, x:x + w]
    eyes = eye_cascade.detectMultiScale(
        upper_face,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(20, 20),
    )

    expected_eye_y1 = int(upper_face.shape[0] * 0.22)
    expected_eye_y2 = int(upper_face.shape[0] * 0.52)
    left_eye_region = upper_face[
        expected_eye_y1:expected_eye_y2,
        int(upper_face.shape[1] * 0.12):int(upper_face.shape[1] * 0.42),
    ]
    right_eye_region = upper_face[
        expected_eye_y1:expected_eye_y2,
        int(upper_face.shape[1] * 0.58):int(upper_face.shape[1] * 0.88),
    ]
    proxy_openness = np.mean([
        estimate_eye_openness_from_region(left_eye_region),
        estimate_eye_openness_from_region(right_eye_region),
    ])
    proxy_closure = 1.0 - proxy_openness

    if len(eyes) == 0:
        return float(proxy_closure), eyes

    largest_eyes = sorted(eyes, key=lambda eye: eye[2] * eye[3], reverse=True)[:2]
    eye_aspect_ratios = [eh / max(ew, 1) for _, _, ew, eh in largest_eyes]
    avg_eye_aspect_ratio = float(np.mean(eye_aspect_ratios))
    expected_open_ratio = 0.38
    aspect_openness = np.clip(avg_eye_aspect_ratio / expected_open_ratio, 0.0, 1.0)

    detected_regions = [
        upper_face[ey:ey + eh, ex:ex + ew]
        for ex, ey, ew, eh in largest_eyes
    ]
    region_openness = float(np.mean([
        estimate_eye_openness_from_region(region)
        for region in detected_regions
    ]))

    if len(largest_eyes) == 1:
        openness_score = 0.35 * aspect_openness + 0.65 * proxy_openness
    else:
        openness_score = 0.45 * aspect_openness + 0.55 * region_openness

    eye_closure_score = 1.0 - np.clip(openness_score, 0.0, 1.0)
    return float(eye_closure_score), eyes


def build_output(user_id, face_detected, redness, paleness, eye_closure_score):
    return {
        "user_id": user_id,
        "timestamp": get_timestamp(),
        "face_detected": face_detected,
        "metrics": {
            "redness": redness,
            "paleness": paleness,
            "eye_closure_score": eye_closure_score,
        },
    }


def main():
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    eye_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_eye.xml"
    )

    if face_cascade.empty() or eye_cascade.empty():
        print("Error: Could not load Haar cascades.")
        return

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    print("Webcam started. Press 'q' to quit.")

    user_id = "user01"
    last_print_time = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Error: Could not read frame.")
            break

        frame = cv2.flip(frame, 1)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(120, 120),
        )

        output = build_output(user_id, False, None, None, None)

        if len(faces) > 0:
            face_box = max(faces, key=lambda box: box[2] * box[3])
            x, y, w, h = face_box

            redness, paleness = extract_face_color_features(frame, face_box)
            eye_closure_score, eyes = estimate_eye_closure(gray, face_box, eye_cascade)
            output = build_output(
                user_id,
                True,
                round(redness, 3),
                round(paleness, 3),
                round(eye_closure_score, 3),
            )

            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
            for ex, ey, ew, eh in eyes:
                cv2.rectangle(
                    frame,
                    (x + ex, y + ey),
                    (x + ex + ew, y + ey + eh),
                    (255, 0, 0),
                    2,
                )

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

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
