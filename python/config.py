"""Detection parameters for the blink-detection pipeline."""

DEFAULTS = {
    # EAR cutoff for "eye closed". Sits between open-eye EAR
    # (~0.25-0.35) and closed-eye EAR (near zero).
    # Soukupova and Cech (2016)
    "EAR_THRESHOLD": 0.21,

    # Consecutive frames of low EAR required to count as a blink.
    # Krolak and Strumillo (2012)
    "CONSEC_FRAMES": 2,

    # Minimum gap between blink events. Blinks typically last ~100-400 ms
    # Soukupova and Cech (2016)
    "COOLDOWN_MS": 150,

    # MediaPipe confidence floor for treating tracking as reliable.
    # Currently dead code (see detector.py); kept as a forward-
    # compatibility hook
    "TRACKING_QUALITY_THRESHOLD": 0.5,

    # MediaPipe Face Landmarker v2 model, relative to python/.
    # Downloaded during setup and resolved at runtime via
    # paths.resource_path().
    "MODEL_PATH": "models/face_landmarker_v2.task",
}


def get_config():
    """Return a fresh copy of the detection parameters."""
    return dict(DEFAULTS)