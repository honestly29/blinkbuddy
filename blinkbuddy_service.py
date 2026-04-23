# blinkbuddy_service.py
# This file is the entry point PyInstaller uses to build the frozen
# binary. 
# It lives at the project root so that PyInstaller treats it as a standalone script 
import os
import shutil
import sys


def _seed_matplotlib_font_cache() -> None:
    """Speed up first launch by copying our pre-built font cache into place.

    MediaPipe imports matplotlib behind the scenes, and matplotlib scans
    every font on the computer the first time it runs (5-15 seconds).
    We already built the cache file during packaging and shipped it inside
    the app, so this function just copies it to where matplotlib expects
    to find it - skipping the slow scan.

    This has to run from the entry point because PyInstaller's own setup
    code points matplotlib at a fresh empty folder on every launch, and
    it runs after anything we could do earlier.
    """
    # If we're not running inside the packaged app, do nothing.
    if not getattr(sys, "frozen", False):
        return
    
    # Where our pre-built cache lives inside the app bundle.
    src_dir = os.path.join(sys._MEIPASS, "matplotlib-cache")

    # Where matplotlib is about to look for its cache.
    dst_dir = os.environ.get("MPLCONFIGDIR")

    # If either folder is missing something's wrong but the app
    # should still start
    if not dst_dir or not os.path.isdir(src_dir):
        return
    
    try:
        # Make sure the destination folder exists.
        os.makedirs(dst_dir, exist_ok=True)

        # Copy every fontlist file from our bundle to where matplotlib will look for it.
        for fname in os.listdir(src_dir):
            if fname.startswith("fontlist-v") and fname.endswith(".json"):
                shutil.copy2(os.path.join(src_dir, fname), os.path.join(dst_dir, fname))
    except OSError:
        # If the copy fails (e.g. disk full), don't stop.
        # Matplotlib will do the slow scan instead,
        # and the app should still start up.
        pass


# The function has to run BEFORE the import line below.
_seed_matplotlib_font_cache()

# `# noqa: E402` tells the code linter not to complain
# that this import isn't at the top of the file.
from python.main import main  # noqa: E402

if __name__ == "__main__":
    main()