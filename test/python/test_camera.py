"""Tests for camera permission detection."""

import os
import subprocess
import sys
from unittest.mock import patch, MagicMock

# -- cv2 mock strategy --
# check_camera_permission() only uses `platform` and `subprocess`, not OpenCV. 
# But camera.py does import cv2 at the top of the file.
# If OpenCV isn't installed in the test environment, the import will crash.
# The workaround: we slip a fake cv2 (MagicMock()) into Python's
# import cache so it doesn't try to load the real one. We clean it up
# afterwards so other test files still get the real cv2.
_cv2_was_missing = "cv2" not in sys.modules
if _cv2_was_missing:
    sys.modules["cv2"] = MagicMock()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from python.camera import check_camera_permission

# Remove the mock so other tests can import the real cv2
if _cv2_was_missing:
    del sys.modules["cv2"]


# ---------------------------------------------------------------------------
# Helpers for mocking the two subprocess.run calls
# ---------------------------------------------------------------------------

# Realistic system_profiler output when a camera is connected
SYSTEM_PROFILER_WITH_CAMERA = (
    "Camera:\n\n"
    "    FaceTime HD Camera:\n\n"
    "      Model ID: FaceTime HD Camera\n"
    "      Unique ID: FDF90FEB-59E5-4FCF-AABD-DA03C4E19BFB\n"
)

# system_profiler output when no camera hardware is found
SYSTEM_PROFILER_NO_CAMERA = "Camera:\n\n"


def _make_profiler_result(stdout):
    """Create a fake subprocess.run() return value for system_profiler.

    The real subprocess.run() returns an object with a .stdout property
    containing the command's text output. We mimic that with a MagicMock."""
    result = MagicMock()
    result.stdout = stdout
    return result


def _make_swift_result(raw_value):
    """Create a fake subprocess.run() return value for the swift command.

    The real swift command prints a number (0-3) followed by a newline,
    so we add the \\n to match that format.
    raw_value is the AVAuthorizationStatus integer as a string ("0"-"3")."""
    result = MagicMock()
    result.stdout = f"{raw_value}\n"
    return result


def _dispatch_subprocess(profiler_stdout, swift_stdout=None, swift_error=None):
    """Create a mock that handles both subprocess.run() calls in
    check_camera_permission().

    The real function calls subprocess.run() twice:
      1. ["system_profiler", ...] to check for camera hardware
      2. ["swift", ...] to check permission status

    Since both calls go through the same subprocess.run function, we need
    one mock that returns different results depending on which command is
    being run. This function returns a side_effect callback that checks
    cmd[0] to decide:
      - "system_profiler" -> return fake profiler output
      - "swift" -> return fake swift output, or raise swift_error if set
    """
    call_count = [0]

    def side_effect(cmd, **kwargs):
        call_count[0] += 1
        if cmd[0] == "system_profiler":
            return _make_profiler_result(profiler_stdout)
        elif cmd[0] == "swift":
            # If swift_error is set, simulate the swift command failing
            if swift_error is not None:
                raise swift_error
            return _make_swift_result(swift_stdout)
        raise ValueError(f"Unexpected command: {cmd}")

    return side_effect

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestCheckCameraPermission:
    """Tests for the two-step check_camera_permission() function.

    Mocks are patched on python.camera.platform and python.camera.subprocess
    (not on platform and subprocess directly) because Python's patch() must
    target the module where the function is called, not where it's defined.
    """

    # -- Platform guard tests (non-macOS should always return 'unknown') --

    def test_returns_unknown_on_non_darwin(self):
        with patch("python.camera.platform.system", return_value="Linux"):
            assert check_camera_permission() == "unknown"

    def test_returns_unknown_on_windows(self):
        with patch("python.camera.platform.system", return_value="Windows"):
            assert check_camera_permission() == "unknown"

    # # -- Step 1: hardware check (system_profiler) --

    def test_returns_unknown_when_no_camera_hardware(self):
        """If system_profiler shows no Model ID, it's not a permission issue."""
        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run",
                   side_effect=_dispatch_subprocess(SYSTEM_PROFILER_NO_CAMERA)):
            assert check_camera_permission() == "unknown"

    def test_returns_unknown_on_profiler_timeout(self):
        """If system_profiler hangs, fall back to 'unknown' (skip step 2 entirely)."""
        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run",
                   side_effect=subprocess.TimeoutExpired("cmd", 5)):
            assert check_camera_permission() == "unknown"

    def test_returns_unknown_on_profiler_oserror(self):
        """If system_profiler isn't found (shouldn't happen on macOS), fall back."""
        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run",
                   side_effect=OSError("not found")):
            assert check_camera_permission() == "unknown"

    # -- Step 2: permission check (swift) --

    def test_returns_denied_when_status_is_denied(self):
        """AVAuthorizationStatus 2 = user clicked 'Don't Allow'."""
        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run",
                   side_effect=_dispatch_subprocess(SYSTEM_PROFILER_WITH_CAMERA, swift_stdout="2")):
            assert check_camera_permission() == "denied"

    def test_returns_denied_when_status_is_restricted(self):
        """AVAuthorizationStatus 1 = restricted."""
        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run",
                   side_effect=_dispatch_subprocess(SYSTEM_PROFILER_WITH_CAMERA, swift_stdout="1")):
            assert check_camera_permission() == "denied"

    def test_returns_unknown_when_status_is_authorised(self):
        """AVAuthorizationStatus 3 = permission granted. Camera failure must
        be caused by something else (camera in use, transient error)."""
        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run",
                   side_effect=_dispatch_subprocess(SYSTEM_PROFILER_WITH_CAMERA, swift_stdout="3")):
            assert check_camera_permission() == "unknown"

    def test_returns_unknown_when_status_is_not_determined(self):
        """AVAuthorizationStatus 0 = user hasn't been asked yet.
        Not a denial, so return 'unknown'."""
        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run",
                   side_effect=_dispatch_subprocess(SYSTEM_PROFILER_WITH_CAMERA, swift_stdout="0")):
            assert check_camera_permission() == "unknown"

    def test_returns_unknown_when_swift_times_out(self):
        """If the swift one-liner takes too long (compiling), fall back gracefully."""
        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run",
                   side_effect=_dispatch_subprocess(
                       SYSTEM_PROFILER_WITH_CAMERA,
                       swift_error=subprocess.TimeoutExpired("swift", 10))):
            assert check_camera_permission() == "unknown"

    def test_returns_unknown_when_swift_not_found(self):
        """If swift CLI isn't available (no Xcode tools), fall back gracefully."""
        with patch("python.camera.platform.system", return_value="Darwin"), \
             patch("python.camera.subprocess.run",
                   side_effect=_dispatch_subprocess(
                       SYSTEM_PROFILER_WITH_CAMERA,
                       swift_error=OSError("swift not found"))):
            assert check_camera_permission() == "unknown"
    
    