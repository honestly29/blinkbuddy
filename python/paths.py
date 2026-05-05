"""Resource path helper that works for both source-code runs and packaged builds."""

import os
import sys


def resource_path(relative):
    """Return an absolute path to a bundled resource.

    In dev, paths resolve relative to this file's directory. 
    In a packaged build, PyInstaller stores bundled files at a 
    different location and exposes it via sys._MEIPASS; this function 
    picks the right base path either way.
    """
    if getattr(sys, "frozen", False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, relative)