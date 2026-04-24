"""Per-frame blink state machine with EAR threshold, consecutive frames, and cooldown."""

import time

from python.config import get_config


class BlinkEngine:
    """Tracks EAR values per frame and emits blink events.

    Uses the `type` field discriminator pattern so that a future
    `partial_blink_event` can be added without breaking existing handlers.

    All thresholds are read from config.py - nothing is hardcoded.
    """

    def __init__(self):
        config = get_config()
        self._ear_threshold = config["EAR_THRESHOLD"]
        self._consec_frames = config["CONSEC_FRAMES"]
        self._cooldown_ms = config["COOLDOWN_MS"]

        # Tracks how many consecutive frames the EAR has been below the threshold. Starts at 0. Incremented when EAR is below threshold. Reset to 0 when EAR rises above threshold or face is lost.
        self._below_count = 0
        # Timestamp of last emitted blink event.
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
            A list of event dicts to emit (may be empty). Each event has a
            `type` field as discriminator.
        """
        events = []
        
        # If no face is detected, _below_count is reset to 0 and tracking_status event with face_dected: False is emmited
        if not detection_result["face_detected"]:
            self._below_count = 0
            events.append({
                "type": "tracking_status",
                "face_detected": False,
                "timestamp": self._now_ms(),
            })
            return events # no further processing happens - no EAR to evaluate

        ear = detection_result["ear"]
        now_ms = self._now_ms()

        events.append({
            "type": "tracking_status",
            "face_detected": True,
            "ear": ear,
            "timestamp": now_ms,
        })

        # If eye is closed (or closing) increment consec-frames counter
        if ear < self._ear_threshold:
            self._below_count += 1
        elif self._below_count >= self._consec_frames:
            # When EAR rises back above the threshold after enough consecutive frames below - a blink event is emmited.
            if (now_ms - self._last_blink_time_ms) >= self._cooldown_ms:
                events.append({
                    "type": "blink_event",
                    "timestamp": now_ms,
                    "ear": ear,
                })
                self._last_blink_time_ms = now_ms
            self._below_count = 0  # EAR above threshold but not enough consecutive frames is considered as noise
        else:
            # EAR above threshold but below_count < consec_frames - not a blink.
            self._below_count = 0

        return events

    def reset(self):
        """Reset internal state (e.g. when stopping a session)."""
        self._below_count = 0
        self._last_blink_time_ms = 0.0