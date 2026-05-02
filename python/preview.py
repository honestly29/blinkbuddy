"""Preview frame rendering: face mesh overlay drawing and JPEG encoding.

Despite drawing onto an image, this module belongs in the inference layer,
not the renderer. Compositing the overlay here and sending a small JPEG is cheaper than shipping the raw camera frame across IPC for the renderer
to draw itself. The output is a base64 JPEG sent over stdout; the renderer
is what actually displays it.
"""

import base64

import cv2
import numpy as np

# Output dimensions and JPEG quality
PREVIEW_WIDTH = 320
PREVIEW_HEIGHT = 240
JPEG_QUALITY = 75

# BGR colours for each landmark group
COLOUR_FACE_OVAL = (200, 200, 200)   # light grey
COLOUR_LEFT_EYE = (0, 255, 0)        # green
COLOUR_RIGHT_EYE = (0, 255, 0)       # green
COLOUR_LIPS = (0, 128, 255)          # orange

# MediaPipe Face Mesh landmark indices 
# Face oval 
FACE_OVAL_INDICES = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
]

# Left eye 
LEFT_EYE_INDICES = [
    362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387,
    386, 385, 384, 398, 362,
]

# Right eye 
RIGHT_EYE_INDICES = [
    33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158,
    159, 160, 161, 246, 33,
]

# Lips
LIPS_INDICES = [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
    409, 270, 269, 267, 0, 37, 39, 40, 185, 61,
]


def _landmarks_to_polyline(landmarks, indices, width, height):
    """Convert landmark indices to pixel coordinate array for cv2.polylines.

    MediaPipe landmarks have normalised .x, .y values in the 0.0-1.0 range.
    This function multiplies them by the frame dimensions to get pixel positions,
    clamping to [0, 1] first to handle partially off-screen faces.

    Args:
        landmarks: List of NormalizedLandmark objects with .x, .y in 0-1 range.
        indices: List of landmark indices forming a connected path.
        width: Frame width in pixels.
        height: Frame height in pixels.

    Returns:
        numpy array of shape (N, 1, 2) with int32 pixel coordinates, which is the format cv2.polylines() requires.
    """
    points = []
    for idx in indices:
        lm = landmarks[idx]
        x = int(np.clip(lm.x, 0.0, 1.0) * width)
        y = int(np.clip(lm.y, 0.0, 1.0) * height)
        points.append([x, y])
    # reshape to (N, 1, 2) where N is the number of points, 1 is an extra dimension, and 2 is (x, y)
    return np.array(points, dtype=np.int32).reshape(-1, 1, 2)



def draw_landmarks(frame, landmarks):
    """Draw face mesh polylines on a BGR frame.

    Draws face oval, eyes, and lips outlines using OpenCV polylines.
    Mutates and returns the frame.

    Args:
        frame: BGR numpy array (H x W x 3).
        landmarks: List of NormalizedLandmark objects (478 landmarks).

    Returns:
        The same frame with overlays drawn (mutated in place).
    """
    h, w = frame.shape[:2]  # Extract height, width from the frame's shape tuple

    face_oval = _landmarks_to_polyline(landmarks, FACE_OVAL_INDICES, w, h)
    cv2.polylines(frame, [face_oval], isClosed=False, color=COLOUR_FACE_OVAL, thickness=1)

    left_eye = _landmarks_to_polyline(landmarks, LEFT_EYE_INDICES, w, h)
    cv2.polylines(frame, [left_eye], isClosed=False, color=COLOUR_LEFT_EYE, thickness=1)

    right_eye = _landmarks_to_polyline(landmarks, RIGHT_EYE_INDICES, w, h)
    cv2.polylines(frame, [right_eye], isClosed=False, color=COLOUR_RIGHT_EYE, thickness=1)

    lips = _landmarks_to_polyline(landmarks, LIPS_INDICES, w, h)
    cv2.polylines(frame, [lips], isClosed=False, color=COLOUR_LIPS, thickness=1)

    return frame



def encode_preview(frame):
    """Resize and JPEG-encode a BGR frame for IPC transmission.

    The encoding pipeline:
      1. Resize to 320x240 using INTER_AREA (downscaling)
      2. JPEG-encode at quality 75 (good clarity, small file size)
      3. Base64-encode for safe JSON serialisation
      4. Package into a dict ready for make_preview_frame()

    Args:
        frame: BGR numpy array of any size.

    Returns:
        Dict with keys: data (base64 string), width (320), height (240).
    """
    # Downscale image using INTER_AREA
    resized = cv2.resize(frame, (PREVIEW_WIDTH, PREVIEW_HEIGHT), interpolation=cv2.INTER_AREA)

    # imencode returns (success_flag, buffer). The buffer is a numpy array of bytes
    ok, buf = cv2.imencode('.jpg', resized, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise RuntimeError("JPEG encoding failed")
    
    # .decode('ascii') converts bytes -> str so it can go directly into a JSON object
    b64 = base64.b64encode(buf).decode('ascii')
    return {"data": b64, "width": PREVIEW_WIDTH, "height": PREVIEW_HEIGHT}



def render_preview(frame, landmarks):
    """Render a preview frame with face mesh overlay.

    Copies the frame first to avoid mutating the detection pipeline's buffer,
    draws landmarks directly onto its input frame, then encodes to base64 JPEG.

    Args:
        frame: BGR numpy array (H x W x 3).
        landmarks: List of NormalizedLandmark objects.

    Returns:
        Dict with keys: data (base64 string), width (320), height (240).
    """
    annotated = draw_landmarks(frame.copy(), landmarks)
    return encode_preview(annotated)