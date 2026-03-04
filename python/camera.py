"""OpenCV camera capture and webcam enumeration."""

import cv2


def list_cameras(max_index=10):
    """Probe camera indices and return those that open successfully.

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


class Camera:
    """Wraps cv2.VideoCapture with configurable resolution."""

    def __init__(self, index=0, width=640, height=480):
        self._index = index
        self._width = width
        self._height = height
        self._cap = None

    def open(self):
        """Open the camera. Returns True on success."""
        self._cap = cv2.VideoCapture(self._index)
        if not self._cap.isOpened():
            self._cap = None
            return False
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self._width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._height)
        return True

    def read(self):
        """Read a frame. Returns (success, frame) tuple."""
        if self._cap is None:
            return False, None
        return self._cap.read()

    def release(self):
        """Release the camera."""
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    def is_opened(self):
        """Return whether the camera is open."""
        return self._cap is not None and self._cap.isOpened()

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
        return False