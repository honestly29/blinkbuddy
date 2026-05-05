"""Per-frame blink state machine with EAR threshold, consecutive frames, and cooldown."""

import time

from python.config import get_config


class BlinkEngine:
    """Tracks EAR values per frame and emits blink events.

    The detection model treats a blink as several consecutive low-EAR
    frames followed by EAR rising back above threshold, not a single
    frame dropping below. This filters out brief eyelid twitches and
    noise. A cooldown after each emitted blink stops one slow blink
    from being counted twice if EAR briefly rises mid-blink.

    Each event carries a `type` field so handlers can tell tracking_status
    events from blink_event events, and so a future event type can be
    added without breaking existing handlers.

    All thresholds come from config.py.
    """

    def __init__(self):
        config = get_config()
        self._ear_threshold = config["EAR_THRESHOLD"]
        self._consec_frames = config["CONSEC_FRAMES"]
        self._cooldown_ms = config["COOLDOWN_MS"]

        # How many recent consecutive frames had EAR below the threshold.
        self._below_count = 0
        # Timestamp of the last emitted blink, used to enforce the cooldown.
        self._last_blink_time_ms = 0.0

    def _now_ms(self):
        """Return current time in milliseconds. Overridable for testing."""
        return time.time() * 1000.0

    def update(self, detection_result):
        """Process one frame's detection result.

        Args:
            detection_result: Dict from FaceDetector.process() with keys
                face_detected (bool) and ear (float | None).

        Returns:
            A list of event dicts to emit (may be empty). Each event has
            a `type` field naming what kind of event it is.
        """
        events = []
        
        # No face: reset the consec-frames counter so a partial run before
        # the tracking gap doesn't combine with frames after it into a false blink.
        if not detection_result["face_detected"]:
            self._below_count = 0
            events.append({
                "type": "tracking_status",
                "face_detected": False,
                "timestamp": self._now_ms(),
            })
            return events 

        ear = detection_result["ear"]
        now_ms = self._now_ms()

        events.append({
            "type": "tracking_status",
            "face_detected": True,
            "ear": ear,
            "timestamp": now_ms,
        })

        # EAR below threshold: increment low consec-frames counter
        if ear < self._ear_threshold:
            self._below_count += 1
        elif self._below_count >= self._consec_frames:
            # EAR rose back above the threshold after enough consecutive frames below - This is a blink.
            if (now_ms - self._last_blink_time_ms) >= self._cooldown_ms:
                events.append({
                    "type": "blink_event",
                    "timestamp": now_ms,
                    "ear": ear,
                })
                self._last_blink_time_ms = now_ms
            self._below_count = 0 
        else:
            # EAR above threshold but the low consec-frames run was too 
            # short to count. Treat as noise and reset.
            self._below_count = 0

        return events

    def reset(self):
        """Clear consec-frames counter and last-blink timestamp.
        Called when stopping a session so the next session starts fresh.
        """
        self._below_count = 0
        self._last_blink_time_ms = 0.0