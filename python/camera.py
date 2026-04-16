"""OpenCV camera capture and device enumeration."""

import platform
import subprocess

import cv2


def check_camera_permission():
    """Check whether camera access is likely denied by the OS.

    On macOS: if system_profiler reports camera hardware
    (Model ID present) but cv2.VideoCapture failed to open, it's likely a settings permission issue.

    Returns:
        'denied' if camera hardware exists but access appears blocked,
        'unknown' otherwise (non-macOS, no hardware, or detection failed).
    """
    # This check only works for macOS. On Linux or Windows fall back to "unknown"
    if platform.system() != "Darwin":
        return "unknown"

    try:
        # system_profiler is a built-in macOS utility that lists hardware details. 
        # SPCameraDataType lists connected cameras regardless of whether the app has permission to use them.
        result = subprocess.run(
            ["system_profiler", "SPCameraDataType"],
            capture_output=True,
            text=True,
            timeout=5,  # Prevent blocking if system_profiler hangs
        )
        # If the output contains "Model ID", a physical camera is connected.
        # But cv2.VideoCapture failed to open, so there is likely
        # a permissions issue
        if "Model ID" in result.stdout:
            return "denied"
    except (subprocess.TimeoutExpired, OSError):
        # TimeoutExpired: system_profiler took too long 
        # OSError: system_profiler not found (shouldn't happen on macOS)
        # In both cases, fall through to return "unknown"
        pass

    return "unknown"


def list_cameras(max_index=10):
    """Probe camera indices and return those that open successfully.

    Tries to open each camera index from 0 to max_index-1 using OpenCV.
    A camera that opens successfully is considered available.

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
            cap.release()  # Release immediately after probing
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
        # Set the requested resolution. 
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