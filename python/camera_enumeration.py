"""OpenCV camera device enumeration.

Note: there are no tests for this module. `list_cameras()` needs a real
webcam to return anything useful, which test environments don't have.
"""

import cv2


def list_cameras(max_index=10):
    """Check camera indices and return those that open successfully.

    Args:
        max_index: Maximum index to probe (exclusive).

    Returns:
        List of dicts with 'index' and 'name' keys for each available camera.
    """
    cameras = []
    for i in range(max_index):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            cameras.append({"index": i, "name": f"Camera {i}"})
            cap.release()
    return cameras