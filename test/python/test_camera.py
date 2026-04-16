"""Tests for camera permission detection."""

import os
import subprocess
import sys
from unittest.mock import patch, MagicMock

# -- cv2 mock strategy --
# check_camera_permission() doesn't use OpenCV (only `platform` and `subprocess`). 
# But camera.py imports cv2 at the top of the file.
# If OpenCV isn't installed in the test environment, that import crashes.
# We inject a MagicMock into sys.modules BEFORE importing camera.py so Python's import system finds the mock instead of trying to load the real package.
# We clean up the mock afterwards so other test files still get the real cv2.
_cv2_was_missing = "cv2" not in sys.modules
if _cv2_was_missing:
    sys.modules["cv2"] = MagicMock()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from python.camera import check_camera_permission

# Remove the mock so other tests can import the real cv2
if _cv2_was_missing:
    del sys.modules["cv2"]


class TestCheckCameraPermission:
    """Tests for check_camera_permission()."""

    def test_returns_unknown_on_non_darwin(self):
        """Platform guard: should return 'unknown' on Linux (not macOS)."""
        with patch("python.camera.platform.system", return_value="Linux"):
            assert check_camera_permission() == "unknown"

    def test_returns_unknown_on_windows(self):
        """Platform guard: should return 'unknown' on Windows (not macOS)."""
        with patch("python.camera.platform.system", return_value="Windows"):
            assert check_camera_permission() == "unknown"

    def test_returns_denied_when_camera_hardware_present(self):
        """If system_profiler reports a camera (Model ID), return 'denied'."""
        # Simulate system_profiler output showing a FaceTime HD Camera
        mock_result = MagicMock()
        mock_result.stdout = (
            "Camera:\n\n"
            "    FaceTime HD Camera:\n\n"
            "      Model ID: FaceTime HD Camera\n"
            "      Unique ID: FDF90FEA-69E5-4FDF-BBAD-CA01C4E67AFB\n"
        )

        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run", return_value=mock_result):
            assert check_camera_permission() == "denied"

    def test_returns_unknown_when_no_camera_hardware(self):
        """If system_profiler output has no Model ID, no camera hardware exists."""
        mock_result = MagicMock()
        mock_result.stdout = "Camera:\n\n"  # Empty camera section

        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run", return_value=mock_result):
            assert check_camera_permission() == "unknown"

    def test_returns_unknown_on_subprocess_timeout(self):
        """If system_profiler hangs, gracefully fall back to 'unknown'."""
        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run", side_effect=subprocess.TimeoutExpired("cmd", 5)):
            assert check_camera_permission() == "unknown"

    def test_returns_unknown_on_oserror(self):
        """If system_profiler is not found (shouldn't happen), fall back to 'unknown'."""
        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run", side_effect=OSError("not found")):
            assert check_camera_permission() == "unknown"