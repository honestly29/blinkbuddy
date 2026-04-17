"""OpenCV camera capture and device enumeration."""

import platform
import subprocess

import cv2


def check_camera_permission():
    """Check whether camera access is likely denied by the OS.

    Uses a two-step check on macOS:
    1. Verify camera hardware exists (system_profiler).
    2. Query actual authorisation status (AVFoundation via swift CLI).

    Returns:
        'denied' if macOS camera authorisation is denied or restricted,
        'unknown' otherwise (not a permission issue, or status unclear).
    """
    if platform.system() != "Darwin":
        return "unknown"

    # Step 1: Verify camera hardware exists
    try:
        result = subprocess.run(
            ["system_profiler", "SPCameraDataType"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if "Model ID" not in result.stdout:
            # No camera hardware found - not a permission issue
            return "unknown"
    except (subprocess.TimeoutExpired, OSError):
        return "unknown"

    # Step 2: Check actual macOS camera authorisation status
    # Uses the swift CLI to query AVFoundation directly
    try:
        auth = subprocess.run(
            [
                "swift", "-e",
                "import AVFoundation; "
                "print(AVCaptureDevice.authorizationStatus(for: .video).rawValue)",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        status = auth.stdout.strip()
        # AVAuthorizationStatus: 0=notDetermined, 1=restricted, 2=denied, 3=authorised
        # Only 1 and 2 are permission problems.
        if status in ("1", "2"):
            return "denied"
    except (subprocess.TimeoutExpired, OSError):
        pass

    # Camera hardware exists but permission status is either authorised (3),
    # not yet determined (0), or we couldn't check.
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