"""Detection parameters loaded from JSON with fallback defaults."""

import json
import os
import sys

DEFAULTS = {
    "EAR_THRESHOLD": 0.21,
    "CONSEC_FRAMES": 2,
    "COOLDOWN_MS": 150,
    "TRACKING_QUALITY_THRESHOLD": 0.5,
    "MODEL_PATH": "models/face_landmarker_v2.task",
}

_config = None


def load_config(path=None):
    """Load detection config from a JSON file, falling back to defaults.

    Args:
        path: Path to a JSON config file. If None, looks for
              detection_config.json in the same directory as this module.

    Returns:
        A dict of detection parameters.
    """
    global _config

    config = dict(DEFAULTS)

    if path is None:
        path = os.path.join(os.path.dirname(__file__), "detection_config.json")

    if os.path.isfile(path):
        try:
            with open(path, "r") as f:
                user_config = json.load(f)
            config.update(user_config)
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: could not load config from {path}: {e}", file=sys.stderr)

    _config = config
    return config


def get_config():
    """Return the loaded config, loading defaults if not yet initialised."""
    global _config
    if _config is None:
        return load_config()
    return _config