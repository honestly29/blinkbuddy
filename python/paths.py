"""Resource path helper that works in both dev and PyInstaller-frozen mode."""

import os
import sys


def resource_path(relative):
    """Return an absolute path that works in both dev and PyInstaller-frozen mode.

    In frozen mode, PyInstaller sets sys._MEIPASS to the bundle root
    (the _internal/ dir in one-dir mode, the extracted tmp dir in one-file mode).
    In dev, paths resolve relative to the python/ package directory.
    """
    if getattr(sys, "frozen", False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, relative)