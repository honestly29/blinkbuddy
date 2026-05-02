"""macOS camera permission status via AVFoundation."""

import platform
import subprocess


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
            return "unknown"
    except (subprocess.TimeoutExpired, OSError):
        return "unknown"

    # Step 2: Check actual macOS camera authorisation status
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
        if status in ("1", "2"):
            return "denied"
    except (subprocess.TimeoutExpired, OSError):
        pass

    return "unknown"