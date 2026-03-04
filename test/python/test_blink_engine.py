"""Unit tests for the blink engine state machine."""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from python.config import load_config
from python.blink_engine import BlinkEngine


# Fixture that reloads the default config before every test so tests are isolated (runs automatically beofre every test)
@pytest.fixture(autouse=True)
def _load_defaults(tmp_path):
    """Ensure default config is loaded before each test."""
    load_config(str(tmp_path / "nonexistent.json"))

def _make_detection(face_detected, ear=None):
    """Helper to build the minimal detection dict expected by BlinkEngine.update()"""
    return {"face_detected": face_detected, "ear": ear}


class TestEarAboveThreshold:
    """Known EAR values above threshold produce no blink."""

    # Verifies that a single frame with EAR above the threshold does not trigger a blink
    def test_no_blink_when_ear_above_threshold(self):
        engine = BlinkEngine()
        events = engine.update(_make_detection(True, ear=0.30))
        blink_events = [e for e in events if e["type"] == "blink_event"]
        assert blink_events == []

    # Verifies that many frames above the threshold never produce a blink event
    def test_multiple_frames_above_threshold(self):
        engine = BlinkEngine()
        for _ in range(10):
            events = engine.update(_make_detection(True, ear=0.28))
            blink_events = [e for e in events if e["type"] == "blink_event"]
            assert blink_events == []

    # Verifies that tracking_status is still emitted when the face is detected
    def test_tracking_status_emitted_when_above(self):
        engine = BlinkEngine()
        events = engine.update(_make_detection(True, ear=0.30))
        tracking = [e for e in events if e["type"] == "tracking_status"]
        assert len(tracking) == 1
        assert tracking[0]["face_detected"] is True


class TestBlinkDetection:
    """EAR below threshold for CONSEC_FRAMES then above emits blink."""

    # Simulates a normal blink: EAR below threshold for required frames then above
    def test_blink_after_consecutive_frames(self):
        engine = BlinkEngine()
        # Two frames below threshold (CONSEC_FRAMES default = 2)
        engine.update(_make_detection(True, ear=0.15))
        engine.update(_make_detection(True, ear=0.15))
        # Frame back above threshold — blink should fire
        events = engine.update(_make_detection(True, ear=0.30))
        blink_events = [e for e in events if e["type"] == "blink_event"]
        assert len(blink_events) == 1
        assert blink_events[0]["type"] == "blink_event"
        assert "timestamp" in blink_events[0]
        assert "ear" in blink_events[0]

    # Checks that the emitted blink event contains the EAR value of the reopening frame
    def test_blink_event_has_correct_ear(self):
        engine = BlinkEngine()
        engine.update(_make_detection(True, ear=0.15))
        engine.update(_make_detection(True, ear=0.15))
        events = engine.update(_make_detection(True, ear=0.28))
        blink_events = [e for e in events if e["type"] == "blink_event"]
        assert blink_events[0]["ear"] == 0.28

    # Ensures a blink still triggers even if the eye stays below threshold longer than required
    def test_more_than_consec_frames_still_blinks(self):
        engine = BlinkEngine()
        for _ in range(5):
            engine.update(_make_detection(True, ear=0.10))
        events = engine.update(_make_detection(True, ear=0.30))
        blink_events = [e for e in events if e["type"] == "blink_event"]
        assert len(blink_events) == 1


class TestCooldownSuppression:
    """Second blink within COOLDOWN_MS is suppressed."""

    # Verifies that a second blink within the cooldown window is ignored
    def test_blink_suppressed_within_cooldown(self):
        engine = BlinkEngine()
        # _now_ms is called once per update() when face is detected.
        # First blink at 200ms (above initial 0 + 150ms cooldown).
        # Second blink at 210ms (within 200 + 150ms cooldown — suppressed).
        timestamps = iter([200.0, 201.0, 202.0, 210.0, 211.0, 212.0])
        engine._now_ms = lambda: next(timestamps)

        # First blink
        engine.update(_make_detection(True, ear=0.15))
        engine.update(_make_detection(True, ear=0.15))
        events = engine.update(_make_detection(True, ear=0.30))
        blink_events = [e for e in events if e["type"] == "blink_event"]
        assert len(blink_events) == 1

        # Second blink within cooldown — suppressed
        engine.update(_make_detection(True, ear=0.15))
        engine.update(_make_detection(True, ear=0.15))
        events = engine.update(_make_detection(True, ear=0.30))
        blink_events = [e for e in events if e["type"] == "blink_event"]
        assert len(blink_events) == 0

    # Verifies that a second blink after the cooldown window is allowed
    def test_blink_allowed_after_cooldown(self):
        engine = BlinkEngine()
        # First blink at 200ms. Second blink at 400ms (200ms gap > 150ms cooldown).
        timestamps = iter([200.0, 201.0, 202.0, 400.0, 401.0, 402.0])
        engine._now_ms = lambda: next(timestamps)

        # First blink
        engine.update(_make_detection(True, ear=0.15))
        engine.update(_make_detection(True, ear=0.15))
        events = engine.update(_make_detection(True, ear=0.30))
        blink_events = [e for e in events if e["type"] == "blink_event"]
        assert len(blink_events) == 1

        # Second blink after cooldown (400 - 202 = 198ms > 150ms)
        engine.update(_make_detection(True, ear=0.15))
        engine.update(_make_detection(True, ear=0.15))
        events = engine.update(_make_detection(True, ear=0.30))
        blink_events = [e for e in events if e["type"] == "blink_event"]
        assert len(blink_events) == 1


class TestSingleFrameDip:
    """EAR below threshold for only 1 frame (< CONSEC_FRAMES) produces no blink."""

    # Ensures a single-frame dip below threshold does not count as a blink
    def test_single_frame_below_no_blink(self):
        engine = BlinkEngine()
        engine.update(_make_detection(True, ear=0.30))
        engine.update(_make_detection(True, ear=0.15))  # 1 frame below
        events = engine.update(_make_detection(True, ear=0.30))  # back above
        blink_events = [e for e in events if e["type"] == "blink_event"]
        assert blink_events == []

    # Tests alternating above/below frames to confirm no blink without consecutive frames
    def test_intermittent_dips_no_blink(self):
        engine = BlinkEngine()
        # Alternating above/below — never hitting CONSEC_FRAMES consecutive
        for _ in range(5):
            engine.update(_make_detection(True, ear=0.15))  # 1 frame below
            events = engine.update(_make_detection(True, ear=0.30))  # back above
            blink_events = [e for e in events if e["type"] == "blink_event"]
            assert blink_events == []


class TestNoFaceTracking:
    """No face detected resets below_count and emits tracking_status."""

    # Verifies that losing face tracking emits a tracking_status event
    def test_no_face_emits_tracking_lost(self):
        engine = BlinkEngine()
        events = engine.update(_make_detection(False))
        tracking = [e for e in events if e["type"] == "tracking_status"]
        assert len(tracking) == 1
        assert tracking[0]["face_detected"] is False

    # Ensures losing the face resets blink detection state
    def test_no_face_resets_below_count(self):
        engine = BlinkEngine()
        # One frame below threshold
        engine.update(_make_detection(True, ear=0.15))
        # Face lost - resets counter
        engine.update(_make_detection(False))
        # One more frame below then above — shouldn't count as blink
        engine.update(_make_detection(True, ear=0.15))
        events = engine.update(_make_detection(True, ear=0.30))
        blink_events = [e for e in events if e["type"] == "blink_event"]
        assert blink_events == []


class TestReset:
    """Engine reset clears all internal state."""

    # Ensures reset() clears blink detection state so partial sequences do not carry over
    def test_reset_clears_below_count(self):
        engine = BlinkEngine()
        engine.update(_make_detection(True, ear=0.15))
        engine.reset()
        # One frame below then above — not enough for a blink
        engine.update(_make_detection(True, ear=0.15))
        events = engine.update(_make_detection(True, ear=0.30))
        blink_events = [e for e in events if e["type"] == "blink_event"]
        assert blink_events == []