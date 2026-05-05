"""Preview frame rendering: eye-contour overlay drawing and JPEG encoding.

This module lives in the inference layer because it operates on landmarks
and camera frame data that are still in use by the detection pipeline. The
output is a base64-encoded JPEG sent to the Electron renderer over IPC;
this module produces the bytes, and the renderer decodes and displays them.
"""

import base64

import cv2
import numpy as np

# Output dimensions chosen to keep the encoded JPEG small enough for
# frequent IPC transfers.
PREVIEW_WIDTH = 320
PREVIEW_HEIGHT = 240
JPEG_QUALITY = 75

# BGR colours for landmark groups (OpenCV uses BGR).
COLOUR_LEFT_EYE = (0, 255, 0)        # green
COLOUR_RIGHT_EYE = (0, 255, 0)       # green

# MediaPipe Face Mesh landmark indices for the two eye contours.
# First index is repeated at the end so the contour closes into a loop.
LEFT_EYE_CONTOUR_INDICES = [
    362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387,
    386, 385, 384, 398, 362,
]

RIGHT_EYE_CONTOUR_INDICES = [
    33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158,
    159, 160, 161, 246, 33,
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
    # Reshape to (N, 1, 2): N points, each with one (x, y) pair.
    return np.array(points, dtype=np.int32).reshape(-1, 1, 2)



def draw_landmarks(frame, landmarks):
    """Draw eye-contour polylines on a BGR frame.

    Draws the left and right eye outlines using OpenCV polylines.
    Mutates the frame in place and returns it.

    Args:
        frame: BGR numpy array (H x W x 3).
        landmarks: List of NormalizedLandmark objects (478 landmarks).

    Returns:
        The same frame with overlays drawn.
    """
    h, w = frame.shape[:2]

    left_eye = _landmarks_to_polyline(landmarks, LEFT_EYE_CONTOUR_INDICES, w, h)
    cv2.polylines(frame, [left_eye], isClosed=False, color=COLOUR_LEFT_EYE, thickness=1)

    right_eye = _landmarks_to_polyline(landmarks, RIGHT_EYE_CONTOUR_INDICES, w, h)
    cv2.polylines(frame, [right_eye], isClosed=False, color=COLOUR_RIGHT_EYE, thickness=1)

    return frame



def encode_preview(frame):
    """Resize and JPEG-encode a BGR frame for IPC transmission.

    The encoding pipeline:
      1. Resize to 320x240 using INTER_AREA (downscaling)
      2. JPEG-encode at quality 75 (good clarity, small file size)
      3. Base64-encode the JPEG bytes so they can be embedded in JSON.

    Args:
        frame: BGR numpy array of any size.

    Returns:
        Dict with keys: data (base64 string), width (320), height (240).
    """

    resized = cv2.resize(frame, (PREVIEW_WIDTH, PREVIEW_HEIGHT), interpolation=cv2.INTER_AREA)

    # imencode returns (success_flag, buffer). The buffer is a numpy
    # array of bytes representing the encoded JPEG.
    ok, buf = cv2.imencode('.jpg', resized, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise RuntimeError("JPEG encoding failed")
    
    # base64 encoding produces bytes; .decode('ascii') converts to a str
    # so it can be embedded directly in a JSON event field.
    b64 = base64.b64encode(buf).decode('ascii')
    return {"data": b64, "width": PREVIEW_WIDTH, "height": PREVIEW_HEIGHT}



def render_preview(frame, landmarks):
    """Render a preview frame with face mesh overlay.

    Copies the input frame first because draw_landmarks mutates its
    argument in place, and the original frame is still owned by the
    detection pipeline. Then encodes the annotated copy to base64 JPEG.

    Args:
        frame: BGR numpy array (H x W x 3).
        landmarks: List of NormalizedLandmark objects.

    Returns:
        Dict with keys: data (base64 string), width (320), height (240).
    """
    annotated = draw_landmarks(frame.copy(), landmarks)
    return encode_preview(annotated)