"""Unit tests for python/detector.py — EAR formula and FaceDetector class.

Covers:
  - compute_ear() — pure function, formula and edge cases
  - landmark index constants (RIGHT_EYE_INDICES, LEFT_EYE_INDICES)
  - FaceDetector class with mocked MediaPipe
"""

import os
import sys
from collections import namedtuple
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from python.config import load_config
from python.detector import (
    FaceDetector,
    LEFT_EYE_INDICES,
    RIGHT_EYE_INDICES,
    compute_ear,
)

# A minimal stand-in for MediaPipe's NormalizedLandmark.
# We only need .x and .y 
Landmark = namedtuple("Landmark", ["x", "y"])

def make_eye(vertical_a, vertical_b, horizontal, origin=(0.0, 0.0)):
    """Build 6 landmarks forming a synthetic eye with known distances.

    - p1 and p4 are the outer and inner corners (horizontal pair)
    - p2 and p6 are upper/lower on the outer side (separated by vertical_a)
    - p3 and p5 are upper/lower on the inner side (separated by vertical_b)

    The EAR formula is: (dist(p2,p6) + dist(p3,p5)) / (2 * dist(p1,p4))

    By controlling vertical_a, vertical_b, and horizontal, we can predict
    the exact EAR value and verify the formula is correct.
    """
    ox, oy = origin
    p1 = Landmark(ox, oy)
    p4 = Landmark(ox + horizontal, oy)
    # Place vertical pairs at 25% and 75% along the horizontal axis,
    # centered vertically around the origin
    p2 = Landmark(ox + horizontal * 0.25, oy + vertical_a / 2)
    p6 = Landmark(ox + horizontal * 0.25, oy - vertical_a / 2)
    p3 = Landmark(ox + horizontal * 0.75, oy + vertical_b / 2)
    p5 = Landmark(ox + horizontal * 0.75, oy - vertical_b / 2)
    return [p1, p2, p3, p4, p5, p6]


def build_478_landmarks(right_eye_params=None, left_eye_params=None):
    """Build a full 478-landmark array like MediaPipe returns.

    MediaPipe FaceLandmarker outputs 478 facial landmarks for each detected
    face. We only care about the 6 landmarks per eye used for EAR, so this
    helper creates an array of 478 zero-position landmarks and fills in
    just the eye landmarks.

    This lets us test FaceDetector.process() without a real camera or model 
    """
    landmarks = [Landmark(0.0, 0.0) for _ in range(478)]

    if right_eye_params is not None:
        right = make_eye(*right_eye_params, origin=(0.1, 0.5))
        for i, idx in enumerate(RIGHT_EYE_INDICES):
            landmarks[idx] = right[i]

    if left_eye_params is not None:
        left = make_eye(*left_eye_params, origin=(0.7, 0.5))
        for i, idx in enumerate(LEFT_EYE_INDICES):
            landmarks[idx] = left[i]

    return landmarks


@pytest.fixture(autouse=True)
def _load_defaults(tmp_path):
    """Reset config to defaults before each test."""
    load_config(str(tmp_path / "nonexistent.json"))


# ---------------------------------------------------------------------------
# Part A — compute_ear()
#
# These tests call compute_ear() directly with synthetic landmarks.
# ---------------------------------------------------------------------------
class TestComputeEarFormula:
    """Verify the EAR formula produces correct values for known inputs."""

    def test_a1_known_symmetric_geometry(self):
        """Basic formula check.

        vertical_a = 1.0, vertical_b = 1.0, horizontal = 2.0
        EAR = (1.0 + 1.0) / (2 * 2.0) = 0.5
        """
        eye = make_eye(vertical_a=1.0, vertical_b=1.0, horizontal=2.0)
        assert compute_ear(eye, (0, 1, 2, 3, 4, 5)) == pytest.approx(0.5)

    def test_a2_closed_eye_is_small(self):
        """A nearly-closed eye (tiny vertical gap) must produce a small EAR."""
        eye = make_eye(vertical_a=0.01, vertical_b=0.01, horizontal=0.5)
        assert compute_ear(eye, (0, 1, 2, 3, 4, 5)) < 0.05

    def test_a3_open_eye_is_realistic(self):
        """An open eye with realistic proportions must exceed the blink threshold."""
        eye = make_eye(vertical_a=0.3, vertical_b=0.3, horizontal=1.0)
        ear = compute_ear(eye, (0, 1, 2, 3, 4, 5))
        assert 0.28 <= ear <= 0.32

    def test_a4_scale_invariance(self):
        """Multiplying all coordinates by a constant must not change the EAR.
        """
        base = make_eye(vertical_a=0.3, vertical_b=0.3, horizontal=1.0)
        base_ear = compute_ear(base, (0, 1, 2, 3, 4, 5))
        for k in (0.5, 2.0, 100.0):
            scaled = [Landmark(p.x * k, p.y * k) for p in base]
            assert compute_ear(scaled, (0, 1, 2, 3, 4, 5)) == pytest.approx(base_ear)

    def test_a5_translation_invariance(self):
        """Shifting all coordinates by a constant offset must not change the EAR."""
        base = make_eye(vertical_a=0.3, vertical_b=0.3, horizontal=1.0)
        base_ear = compute_ear(base, (0, 1, 2, 3, 4, 5))
        for dx, dy in ((1.0, 0.0), (0.0, -5.0), (3.14, 2.71)):
            shifted = [Landmark(p.x + dx, p.y + dy) for p in base]
            assert compute_ear(shifted, (0, 1, 2, 3, 4, 5)) == pytest.approx(base_ear)

    def test_a6_index_order_matters(self):
        """Swapping landmark indices must produce a different EAR."""
        eye = make_eye(vertical_a=0.3, vertical_b=0.5, horizontal=1.0)
        canonical = compute_ear(eye, (0, 1, 2, 3, 4, 5))
        # Swap the two upper-eyelid points - changes which vertical distance is which
        swap_p2_p3 = compute_ear(eye, (0, 2, 1, 3, 4, 5))
        # Swap an outer corner with an upper-eyelid point - changes the horizontal distance
        swap_p1_p2 = compute_ear(eye, (1, 0, 2, 3, 4, 5))
        assert swap_p2_p3 != pytest.approx(canonical)
        assert swap_p1_p2 != pytest.approx(canonical)

    def test_a7_asymmetric_vertical_distances_average(self):
        """Both vertical pairs must contribute to the result.

        Expected: (0.4 + 0.6) / (2 * 1.0) = 0.5
        """
        eye = make_eye(vertical_a=0.4, vertical_b=0.6, horizontal=1.0)
        assert compute_ear(eye, (0, 1, 2, 3, 4, 5)) == pytest.approx(0.5)


class TestComputeEarEdgeCases:
    """Divide-by-zero guards and degenerate inputs."""

    def test_a8_horizontal_zero_returns_zero(self):
        """When p1 and p4 overlap, horizontal distance is 0.

        The formula divides by horizontal distance, so this would
        cause a ZeroDivisionError without the guard in detector.py.
        Must return 0.0 cleanly, not raise or return an error.
        """
        landmarks = [
            Landmark(0.5, 0.5),  # p1
            Landmark(0.3, 0.6),  # p2
            Landmark(0.7, 0.6),  # p3
            Landmark(0.5, 0.5),  # p4 (same as p1 - zero horizontal distance)
            Landmark(0.7, 0.4),  # p5
            Landmark(0.3, 0.4),  # p6
        ]
        assert compute_ear(landmarks, (0, 1, 2, 3, 4, 5)) == 0.0

    def test_a9_all_zero_landmarks_return_zero(self):
        """All landmarks at the origin."""
        landmarks = [Landmark(0.0, 0.0) for _ in range(6)]
        assert compute_ear(landmarks, (0, 1, 2, 3, 4, 5)) == 0.0


class TestComputeEarDuckTyping:
    """compute_ear() must depend on .x and .y only.

    If a future change accidentally adds a dependency on .z or any
    other attribute, these tests fail and the change has to be made
    deliberately. Production always passes MediaPipe landmarks, but
    we don't want the function to silently require more than it needs.
    """

    def test_a10_works_with_simplenamespace(self):
        """SimpleNamespace instead of namedtuple - verifies duck typing."""
        eye = [
            SimpleNamespace(x=0.0, y=0.0),
            SimpleNamespace(x=0.25, y=0.5),
            SimpleNamespace(x=0.75, y=0.5),
            SimpleNamespace(x=1.0, y=0.0),
            SimpleNamespace(x=0.75, y=-0.5),
            SimpleNamespace(x=0.25, y=-0.5),
        ]
        # vertical_a = vertical_b = 1.0, horizontal = 1.0 -> EAR = 1.0
        assert compute_ear(eye, (0, 1, 2, 3, 4, 5)) == pytest.approx(1.0)

    def test_a10_tolerates_extra_attributes(self):
        """Objects with extra attributes (z, visibility, presence) must work.

        MediaPipe's real NormalizedLandmark has these extra fields.
        compute_ear() must not accidentally reference them.
        """
        eye = [
            SimpleNamespace(x=0.0, y=0.0, z=0.1, visibility=0.9, presence=0.9),
            SimpleNamespace(x=0.25, y=0.5, z=0.1, visibility=0.9, presence=0.9),
            SimpleNamespace(x=0.75, y=0.5, z=0.1, visibility=0.9, presence=0.9),
            SimpleNamespace(x=1.0, y=0.0, z=0.1, visibility=0.9, presence=0.9),
            SimpleNamespace(x=0.75, y=-0.5, z=0.1, visibility=0.9, presence=0.9),
            SimpleNamespace(x=0.25, y=-0.5, z=0.1, visibility=0.9, presence=0.9),
        ]
        assert compute_ear(eye, (0, 1, 2, 3, 4, 5)) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# Part B — Landmark index constants
#
# These tests validate the hard-coded index tuples that select which
# of MediaPipe's 478 facial landmarks are used for each eye. A wrong
# index here means the EAR formula runs on the wrong face points,
# producing meaningless blink detection.
# ---------------------------------------------------------------------------
class TestLandmarkConstants:
    """RIGHT_EYE_INDICES and LEFT_EYE_INDICES are well-formed."""

    def test_b1_right_eye_is_6_tuple_of_valid_ints(self):
        """Must be exactly 6 indices, all within MediaPipe's 478-landmark range."""
        assert isinstance(RIGHT_EYE_INDICES, tuple)
        assert len(RIGHT_EYE_INDICES) == 6
        for i in RIGHT_EYE_INDICES:
            assert isinstance(i, int)
            assert 0 <= i < 478

    def test_b1_left_eye_is_6_tuple_of_valid_ints(self):
        """Must be exactly 6 indices, all within MediaPipe's 478-landmark range."""
        assert isinstance(LEFT_EYE_INDICES, tuple)
        assert len(LEFT_EYE_INDICES) == 6
        for i in LEFT_EYE_INDICES:
            assert isinstance(i, int)
            assert 0 <= i < 478

    def test_b2_no_duplicates_within_right_eye(self):
        """Each index must refer to a different landmark."""
        assert len(set(RIGHT_EYE_INDICES)) == 6

    def test_b2_no_duplicates_within_left_eye(self):
        """Each index must refer to a different landmark."""
        assert len(set(LEFT_EYE_INDICES)) == 6

    def test_b3_right_and_left_are_disjoint(self):
        """The two eyes must not share any landmark indices."""
        assert set(RIGHT_EYE_INDICES).isdisjoint(LEFT_EYE_INDICES)

    def test_b4_exact_spec_values(self):
        """Ensure the indices are the exact values documented in MediaPipe. """
        assert RIGHT_EYE_INDICES == (33, 160, 158, 133, 153, 144)
        assert LEFT_EYE_INDICES == (362, 385, 387, 263, 373, 380)


# ---------------------------------------------------------------------------
# Part C — FaceDetector (requires MediaPipe mocking)
#
# FaceDetector wraps MediaPipe's FaceLandmarker. To test it without
# a real camera or model file, we mock all MediaPipe imports.
# ---------------------------------------------------------------------------
@pytest.fixture
def mock_mediapipe():
    """Replace the real MediaPipe library with mock objects so we can:
    - Construct FaceDetector without a real .task model file
    - Control what landmarks FaceDetector.process() "sees"
    - Verify cleanup behaviour (close() calls)
    """
    with patch("python.detector.os.path.isfile", return_value=True), \
         patch("python.detector.mp.tasks.BaseOptions"), \
         patch("python.detector.mp.tasks.vision.FaceLandmarkerOptions"), \
         patch("python.detector.mp.tasks.vision.RunningMode"), \
         patch("python.detector.mp.tasks.vision.FaceLandmarker") as mock_fl, \
         patch("python.detector.mp.Image"), \
         patch("python.detector.mp.ImageFormat"):
        yield mock_fl


class TestFaceDetectorInit:
    """FaceDetector construction."""

    def test_c1_missing_model_file_raises_filenotfound(self):
        """If the MediaPipe .task model file is missing, give a helpful error.

        First-time users who skip the setup step would otherwise get a
        confusing MediaPipe error. The error message should mention the
        setup script so they know how to fix it.
        """
        with patch("python.detector.os.path.isfile", return_value=False):
            with pytest.raises(FileNotFoundError, match="setup_model.py"):
                FaceDetector()


class TestFaceDetectorProcess:
    """FaceDetector.process() with stubbed MediaPipe results."""

    def test_c2_no_face_detected_returns_correct_shape(self, mock_mediapipe):
        """When MediaPipe finds no face, the return dict must have this exact shape.

        The rest of the app (BlinkEngine, SessionManager) checks these
        specific keys to decide whether to enter SUPPRESSED state.
        """
        landmarker = MagicMock()
        result = MagicMock()
        result.face_landmarks = []  # No faces found
        landmarker.detect_for_video.return_value = result
        mock_mediapipe.create_from_options.return_value = landmarker

        detector = FaceDetector()
        out = detector.process(MagicMock(), 0)

        assert out == {
            "face_detected": False,
            "ear": None,
            "landmarks": None,
            "quality": None,
        }

    def test_c3_averages_right_and_left_eye_ear(self, mock_mediapipe):
        """The returned EAR must be the average of both eyes.

        Right eye gives EAR = 0.2, left eye gives EAR = 0.3.
        Expected average = 0.25.
        """
        landmarks = build_478_landmarks(
            right_eye_params=(0.2, 0.2, 1.0),  # Will produce EAR 0.2
            left_eye_params=(0.3, 0.3, 1.0),   # Will produce EAR 0.3
        )
        landmarker = MagicMock()
        result = MagicMock()
        result.face_landmarks = [landmarks]
        landmarker.detect_for_video.return_value = result
        mock_mediapipe.create_from_options.return_value = landmarker

        detector = FaceDetector()
        out = detector.process(MagicMock(), 0)

        assert out["face_detected"] is True
        assert out["ear"] == pytest.approx(0.25)
        assert out["quality"] == 1.0
        assert out["landmarks"] is landmarks

    def test_c4_binds_correct_index_set_to_each_eye(self, mock_mediapipe):
        """Each eye must use its own index set, not the other eye's.

        If the code used RIGHT_EYE_INDICES for both eyes, the average
        would be 0.5. If it used LEFT_EYE_INDICES for both, it would be 0.1.
        Only the correct binding gives 0.3.
        """
        landmarks = build_478_landmarks(
            right_eye_params=(0.5, 0.5, 1.0),
            left_eye_params=(0.1, 0.1, 1.0),
        )
        landmarker = MagicMock()
        result = MagicMock()
        result.face_landmarks = [landmarks]
        landmarker.detect_for_video.return_value = result
        mock_mediapipe.create_from_options.return_value = landmarker

        detector = FaceDetector()
        out = detector.process(MagicMock(), 0)

        assert out["ear"] == pytest.approx(0.3)

    def test_c5_context_manager_closes_landmarker_on_normal_exit(self, mock_mediapipe):
        """The MediaPipe landmarker must be closed when the 'with' block exits. """
        landmarker = MagicMock()
        mock_mediapipe.create_from_options.return_value = landmarker

        with FaceDetector() as d:
            assert isinstance(d, FaceDetector)

        landmarker.close.assert_called_once()

    def test_c5_context_manager_closes_landmarker_on_exception(self, mock_mediapipe):
        """Cleanup must happen even if an exception occurs inside the 'with' block."""
        landmarker = MagicMock()
        mock_mediapipe.create_from_options.return_value = landmarker

        with pytest.raises(RuntimeError, match="boom"):
            with FaceDetector():
                raise RuntimeError("boom")

        landmarker.close.assert_called_once()


class TestFaceDetectorQualityGate:
    """Regression guard for the hardcoded quality=1.0 known issue.

    CONTEXT: MediaPipe's FaceLandmarker doesn't expose a per-frame
    tracking quality score. detector.py works around this by hardcoding
    quality=1.0. This means the quality threshold check in detector.py is effectively dead code as faces always pass.

    These tests document this so that if a later MediaPipe version does expose quality tracking, the threshold behaviour is already tested and won't silently start rejecting faces.
    """

    def test_c6_face_passes_when_threshold_below_hardcoded_quality(
        self, mock_mediapipe, tmp_path
    ):
        """With threshold=0.99 and hardcoded quality=1.0, faces pass (1.0 >= 0.99)."""
        config_path = tmp_path / "config.json"
        config_path.write_text('{"TRACKING_QUALITY_THRESHOLD": 0.99}')
        load_config(str(config_path))

        landmarks = build_478_landmarks(
            right_eye_params=(0.3, 0.3, 1.0),
            left_eye_params=(0.3, 0.3, 1.0),
        )
        landmarker = MagicMock()
        result = MagicMock()
        result.face_landmarks = [landmarks]
        landmarker.detect_for_video.return_value = result
        mock_mediapipe.create_from_options.return_value = landmarker

        detector = FaceDetector()
        out = detector.process(MagicMock(), 0)

        assert out["face_detected"] is True

    def test_c6_face_rejected_when_threshold_above_hardcoded_quality(
        self, mock_mediapipe, tmp_path
    ):
        """With threshold=1.5 and hardcoded quality=1.0, faces are rejected.

        Currently, this threshold will never occur in practice, but it tests that the threshold comparison logic works correctly.
        """
        config_path = tmp_path / "config.json"
        config_path.write_text('{"TRACKING_QUALITY_THRESHOLD": 1.5}')
        load_config(str(config_path))

        landmarks = build_478_landmarks(
            right_eye_params=(0.3, 0.3, 1.0),
            left_eye_params=(0.3, 0.3, 1.0),
        )
        landmarker = MagicMock()
        result = MagicMock()
        result.face_landmarks = [landmarks]
        landmarker.detect_for_video.return_value = result
        mock_mediapipe.create_from_options.return_value = landmarker

        detector = FaceDetector()
        out = detector.process(MagicMock(), 0)

        assert out["face_detected"] is False
        # quality is still reported as 1.0 (the hardcoded value)
        assert out["quality"] == 1.0