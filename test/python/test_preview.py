"""Tests for python/preview.py - landmark drawing, JPEG encoding, and render_preview."""

import base64

import cv2
import numpy as np
import pytest

from python.preview import (
    PREVIEW_HEIGHT,
    PREVIEW_WIDTH,
    draw_landmarks,
    encode_preview,
    render_preview,
)


class _MockLandmark:
    """Mimics MediaPipe NormalizedLandmark with .x, .y attributes."""

    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y


def _make_landmarks(count=478, x=0.5, y=0.5):
    """Create a list of mock landmarks at the given position."""
    return [_MockLandmark(x, y) for _ in range(count)]


def _make_frame(width=640, height=480):
    """Create a blank BGR frame using np.zeros.

    This makes it easy to detect whether drawing occurred:
    any non-zero pixel was drawn by the overlay code.
    """
    return np.zeros((height, width, 3), dtype=np.uint8)


class TestDrawLandmarks:
    """Tests for the draw_landmarks function (face mesh polyline drawing)."""

    def test_returns_same_shape_frame(self):
        """Drawing should not change the frame's dimensions."""
        frame = _make_frame(640, 480)
        landmarks = _make_landmarks()
        result = draw_landmarks(frame, landmarks)
        assert result.shape == (480, 640, 3)

    def test_modifies_pixels(self):
        """Drawing landmarks should change at least some pixel values."""
        frame = _make_frame(640, 480)
        original = frame.copy()
        landmarks = _make_landmarks()
        draw_landmarks(frame, landmarks)
        # The drawn polylines should change some pixels 
        # on the blank frame
        assert not np.array_equal(frame, original)

    def test_returns_same_frame_object(self):
        """draw_landmarks mutates in place and returns the same object (not a copy)."""
        frame = _make_frame()
        landmarks = _make_landmarks()
        result = draw_landmarks(frame, landmarks)
        assert result is frame

    # -- Boundary/edge case tests for np.clip behaviour --

    def test_handles_boundary_coords_zero(self):
        """Landmarks at (0.0, 0.0) (the top-left corner) - should not crash."""
        frame = _make_frame()
        landmarks = _make_landmarks(x=0.0, y=0.0)
        result = draw_landmarks(frame, landmarks)
        assert result.shape == frame.shape

    def test_handles_boundary_coords_one(self):
        """Landmarks at (1.0, 1.0) (the bottom-right corner) - should not crash."""
        frame = _make_frame()
        landmarks = _make_landmarks(x=1.0, y=1.0)
        result = draw_landmarks(frame, landmarks)
        assert result.shape == frame.shape

    def test_handles_out_of_range_coords(self):
        """Coordinates outside 0-1 should be clamped by np.clip, not crash."""
        frame = _make_frame()
        landmarks = _make_landmarks(x=1.5, y=-0.5)
        result = draw_landmarks(frame, landmarks)
        assert result.shape == frame.shape


class TestEncodePreview:
    """Tests for the encode_preview function (resize + JPEG + base64)."""

    def test_correct_dimensions(self):
        """Output dict should report the standard preview dimensions."""
        frame = _make_frame(640, 480)
        result = encode_preview(frame)
        assert result["width"] == PREVIEW_WIDTH
        assert result["height"] == PREVIEW_HEIGHT

    def test_valid_base64(self):
        """The data field should be valid base64 that decodes without error."""
        frame = _make_frame(640, 480)
        result = encode_preview(frame)
        decoded = base64.b64decode(result["data"])
        assert len(decoded) > 0

    def test_valid_jpeg_header(self):
        """The decoded bytes should start with the JPEG magic number (FF D8)."""
        frame = _make_frame(640, 480)
        result = encode_preview(frame)
        decoded = base64.b64decode(result["data"])
        # All valid JPEG files begin with these two bytes
        assert decoded[:2] == b'\xff\xd8'

    def test_reasonable_size(self):
        """A 320x240 JPEG at quality 75 should be under 100KB."""
        frame = _make_frame(640, 480)
        result = encode_preview(frame)
        decoded = base64.b64decode(result["data"])
        assert len(decoded) < 100_000

    def test_returns_expected_keys(self):
        """Output dict should have exactly three keys: data, width, height."""
        frame = _make_frame()
        result = encode_preview(frame)
        assert set(result.keys()) == {"data", "width", "height"}

    def test_works_with_non_standard_input_size(self):
        """Any input resolution should be resized to the standard 320x240."""
        frame = _make_frame(1280, 720)  # HD input
        result = encode_preview(frame)
        assert result["width"] == PREVIEW_WIDTH
        assert result["height"] == PREVIEW_HEIGHT


class TestRenderPreview:
    """Tests for the render_preview function (full pipeline: copy + draw + encode)."""

    def test_does_not_mutate_input(self):
        """render_preview should copy the frame before drawing on it."""
        frame = _make_frame(640, 480)
        original = frame.copy()
        landmarks = _make_landmarks()
        render_preview(frame, landmarks)
        # The original frame should be completely unchanged
        assert np.array_equal(frame, original)

    def test_returns_expected_keys(self):
        """Output should have the same three keys as encode_preview."""
        frame = _make_frame()
        landmarks = _make_landmarks()
        result = render_preview(frame, landmarks)
        assert set(result.keys()) == {"data", "width", "height"}

    def test_end_to_end_valid_jpeg(self):
        """The full pipeline should produce a valid JPEG."""
        frame = _make_frame(640, 480)
        landmarks = _make_landmarks()
        result = render_preview(frame, landmarks)
        decoded = base64.b64decode(result["data"])
        assert decoded[:2] == b'\xff\xd8'

    def test_output_dimensions(self):
        """The full pipeline should always output 320x240."""
        frame = _make_frame()
        landmarks = _make_landmarks()
        result = render_preview(frame, landmarks)
        assert result["width"] == 320
        assert result["height"] == 240