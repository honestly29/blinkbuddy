"""Download the MediaPipe FaceLandmarker model file."""

import os
import shutil
import subprocess
import sys
import urllib.request

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
)

DEST_DIR = os.path.join(os.path.dirname(__file__), "..", "python", "models")
DEST_FILE = os.path.join(DEST_DIR, "face_landmarker_v2.task")


def _download_with_curl(url, dest):
    """Download using curl."""
    curl = shutil.which("curl")
    if not curl:
        return False
    result = subprocess.run(
        [curl, "-L", "-o", dest, url],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def _download_with_urllib(url, dest):
    """Download using urllib (standard library)."""
    urllib.request.urlretrieve(url, dest)


def main():
    if os.path.isfile(DEST_FILE):
        size_mb = os.path.getsize(DEST_FILE) / (1024 * 1024)
        print(f"Model already exists at {DEST_FILE} ({size_mb:.1f} MB). Skipping.")
        return

    os.makedirs(DEST_DIR, exist_ok=True)
    print(f"Downloading FaceLandmarker model to {DEST_FILE} ...")

    # Try curl first, fall back to urllib.
    try:
        if not _download_with_curl(MODEL_URL, DEST_FILE):
            _download_with_urllib(MODEL_URL, DEST_FILE)
    except Exception as e:
        # Clean up partial download
        if os.path.isfile(DEST_FILE):
            os.remove(DEST_FILE)
        print(f"ERROR: Download failed: {e}", file=sys.stderr)
        sys.exit(1)

    size_mb = os.path.getsize(DEST_FILE) / (1024 * 1024)
    if size_mb < 1.0:
        os.remove(DEST_FILE)
        print(
            f"ERROR: Downloaded file is too small ({size_mb:.2f} MB). Deleted.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Done. Model saved ({size_mb:.1f} MB).")


if __name__ == "__main__":
    main()
