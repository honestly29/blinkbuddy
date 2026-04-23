"""MediaPipe FaceLandmarker detection and EAR computation."""

import os

import numpy as np
import mediapipe as mp

from python.config import get_config
from python.paths import resource_path

# MediaPipe Face Mesh landmark indices for EAR computation.
# Each eye has 6 landmarks: p1 (outer corner), p2 (upper-outer),
# p3 (upper-inner), p4 (inner corner), p5 (lower-inner), p6 (lower-outer).
RIGHT_EYE_INDICES = (33, 160, 158, 133, 153, 144)
LEFT_EYE_INDICES = (362, 385, 387, 263, 373, 380)


def compute_ear(landmarks, indices):
    """Compute the Eye Aspect Ratio for one eye.

    EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)

    Args:
        landmarks: List of NormalizedLandmark objects with .x, .y attributes.
        indices: Tuple of 6 landmark indices (p1, p2, p3, p4, p5, p6).

    Returns:
        The EAR value as a float.
    """
    pts = np.array(
        [(landmarks[i].x, landmarks[i].y) for i in indices], dtype=np.float64
    )
    # p1=0, p2=1, p3=2, p4=3, p5=4, p6=5
    vertical_a = np.linalg.norm(pts[1] - pts[5])  # ||p2 - p6||
    vertical_b = np.linalg.norm(pts[2] - pts[4])  # ||p3 - p5||
    horizontal = np.linalg.norm(pts[0] - pts[3])   # ||p1 - p4||

    # protects against division by zero if landmark detection is not working correctly
    if horizontal == 0:
        return 0.0

    return (vertical_a + vertical_b) / (2.0 * horizontal)


class FaceDetector:
    """Wraps MediaPipe FaceLandmarker for landmark detection and EAR computation."""

    def __init__(self):
        config = get_config()
        model_path = resource_path(config["MODEL_PATH"])

        # Check that model file has been downloaded
        if not os.path.isfile(model_path):
            raise FileNotFoundError(
                f"Model file not found at {model_path}. "
                "Run: python scripts/setup_model.py"
            )

        base_options = mp.tasks.BaseOptions(model_asset_path=model_path)
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
        )
        self._landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)

    def process(self, frame_rgb, timestamp_ms):
        """Run FaceLandmarker on an RGB frame.

        Args:
            frame_rgb: An RGB numpy array (H x W x 3).
            timestamp_ms: Frame timestamp in milliseconds (must be monotonically
                increasing between calls).

        Returns:
            A dict with keys:
                face_detected (bool): Whether a face was found above the
                    quality threshold.
                ear (float | None): Average EAR if face detected, else None.
                landmarks (list | None): Raw landmark list if face detected.
                quality (float | None): Detection confidence if face detected.
        """
        config = get_config()
        quality_threshold = config["TRACKING_QUALITY_THRESHOLD"]

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        result = self._landmarker.detect_for_video(mp_image, int(timestamp_ms))

        if not result.face_landmarks:
            return {
                "face_detected": False,
                "ear": None,
                "landmarks": None,
                "quality": None,
            }

       
        # Hardcoded because MediaPipe's FaceLandmarker doesn't expose a per-frame quality score.
        quality = 1.0

        if quality < quality_threshold:
            return {
                "face_detected": False,
                "ear": None,
                "landmarks": None,
                "quality": quality,
            }

        # Get the landmarks for the first (and only) detected face
        landmarks = result.face_landmarks[0]
        # Compute EAR per eye then average
        ear_right = compute_ear(landmarks, RIGHT_EYE_INDICES)
        ear_left = compute_ear(landmarks, LEFT_EYE_INDICES)
        avg_ear = (ear_right + ear_left) / 2.0

        return {
            "face_detected": True,
            "ear": avg_ear,
            "landmarks": landmarks,
            "quality": quality,
        }

    def close(self):
        """Release MediaPipe resources."""
        self._landmarker.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False