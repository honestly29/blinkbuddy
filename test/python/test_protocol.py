"""Unit tests for protocol serialisation/deserialisation."""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from python.protocol import (
    COMMAND_TYPES,
    EVENT_TYPES,
    deserialise,
    deserialise_command,
    make_blink_event,
    make_camera_list,
    make_error,
    make_preview_frame,
    make_status,
    make_tracking_status,
    serialise,
)


class TestSerialise:
    """serialise() produces valid JSON Lines."""

    def test_basic_message(self):
        msg = {"type": "status", "state": "running"}
        result = serialise(msg)
        assert result.endswith("\n")
        parsed = json.loads(result)
        assert parsed == msg

    def test_rejects_non_dict(self):
        with pytest.raises(ValueError, match="must be a dict"):
            serialise("not a dict")

    def test_rejects_list(self):
        with pytest.raises(ValueError, match="must be a dict"):
            serialise([{"type": "status"}])

    def test_rejects_missing_type(self):
        with pytest.raises(ValueError, match="'type' key"):
            serialise({"state": "running"})

    def test_preserves_all_fields(self):
        msg = {
            "type": "blink_event",
            "timestamp": 1709380800000,
            "ear_value": 0.18,
            "duration_ms": None,
        }
        result = serialise(msg)
        parsed = json.loads(result)
        assert parsed == msg

    def test_no_extra_newlines(self):
        msg = {"type": "stop"}
        result = serialise(msg)
        # Exactly one trailing newline
        assert result.count("\n") == 1
        assert result[-1] == "\n"


class TestDeserialise:
    """deserialise() parses JSON Lines strings."""

    def test_basic_message(self):
        line = '{"type":"status","state":"running"}\n'
        result = deserialise(line)
        assert result == {"type": "status", "state": "running"}

    def test_without_trailing_newline(self):
        line = '{"type":"stop"}'
        result = deserialise(line)
        assert result == {"type": "stop"}

    def test_with_whitespace(self):
        line = '  {"type":"stop"}  \n'
        result = deserialise(line)
        assert result == {"type": "stop"}

    def test_rejects_empty_line(self):
        with pytest.raises(ValueError, match="Empty line"):
            deserialise("")

    def test_rejects_whitespace_only(self):
        with pytest.raises(ValueError, match="Empty line"):
            deserialise("   \n")

    def test_rejects_invalid_json(self):
        with pytest.raises(ValueError, match="Invalid JSON"):
            deserialise("{not valid json}")

    def test_rejects_truncated_json(self):
        with pytest.raises(ValueError, match="Invalid JSON"):
            deserialise('{"type": "start"')

    def test_rejects_non_object(self):
        with pytest.raises(ValueError, match="JSON object"):
            deserialise('"just a string"')

    def test_rejects_json_array(self):
        with pytest.raises(ValueError, match="JSON object"):
            deserialise('[{"type":"stop"}]')

    def test_rejects_missing_type(self):
        with pytest.raises(ValueError, match="'type' key"):
            deserialise('{"state":"running"}')


class TestDeserialiseCommand:
    """deserialise_command() validates command types."""

    def test_valid_start(self):
        line = '{"type":"start","camera_index":0,"preview_enabled":false}'
        result = deserialise_command(line)
        assert result["type"] == "start"
        assert result["camera_index"] == 0

    def test_valid_stop(self):
        result = deserialise_command('{"type":"stop"}')
        assert result["type"] == "stop"

    def test_valid_set_preview(self):
        result = deserialise_command('{"type":"set_preview","enabled":true}')
        assert result["type"] == "set_preview"
        assert result["enabled"] is True

    def test_valid_list_cameras(self):
        result = deserialise_command('{"type":"list_cameras"}')
        assert result["type"] == "list_cameras"

    def test_rejects_unknown_type(self):
        with pytest.raises(ValueError, match="Unknown command type"):
            deserialise_command('{"type":"blink_event","timestamp":123}')

    def test_rejects_event_type(self):
        with pytest.raises(ValueError, match="Unknown command type"):
            deserialise_command('{"type":"tracking_status"}')

    def test_rejects_invalid_json(self):
        with pytest.raises(ValueError, match="Invalid JSON"):
            deserialise_command("not json at all")

    def test_rejects_missing_type(self):
        with pytest.raises(ValueError, match="'type' key"):
            deserialise_command('{"camera_index":0}')


class TestRoundTrip:
    """Messages survive serialise -> deserialise round-trips."""

    def test_start_command(self):
        msg = {"type": "start", "camera_index": 0, "preview_enabled": False}
        assert deserialise(serialise(msg)) == msg

    def test_stop_command(self):
        msg = {"type": "stop"}
        assert deserialise(serialise(msg)) == msg

    def test_set_preview_command(self):
        msg = {"type": "set_preview", "enabled": True}
        assert deserialise(serialise(msg)) == msg

    def test_list_cameras_command(self):
        msg = {"type": "list_cameras"}
        assert deserialise(serialise(msg)) == msg

    def test_blink_event(self):
        msg = make_blink_event(1709380800000, 0.18, duration_ms=150)
        assert deserialise(serialise(msg)) == msg

    def test_blink_event_null_duration(self):
        msg = make_blink_event(1709380800000, 0.18)
        result = deserialise(serialise(msg))
        assert result["duration_ms"] is None
        assert result["ear_value"] == 0.18

    def test_tracking_status(self):
        msg = make_tracking_status(True, 0.92, 1709380800000)
        assert deserialise(serialise(msg)) == msg

    def test_tracking_status_no_face(self):
        msg = make_tracking_status(False, 0.0, 1709380800000)
        result = deserialise(serialise(msg))
        assert result["face_detected"] is False

    def test_preview_frame(self):
        msg = make_preview_frame("base64data==", 320, 240, 1709380800000)
        assert deserialise(serialise(msg)) == msg

    def test_camera_list(self):
        cameras = [
            {"index": 0, "name": "FaceTime HD Camera"},
            {"index": 1, "name": "USB Camera"},
        ]
        msg = make_camera_list(cameras)
        assert deserialise(serialise(msg)) == msg

    def test_camera_list_empty(self):
        msg = make_camera_list([])
        result = deserialise(serialise(msg))
        assert result["cameras"] == []

    def test_error(self):
        msg = make_error("CAMERA_OPEN_FAILED", "Could not open camera at index 0")
        assert deserialise(serialise(msg)) == msg

    def test_status_running(self):
        msg = make_status("running")
        assert deserialise(serialise(msg)) == msg

    def test_status_stopped(self):
        msg = make_status("stopped")
        assert deserialise(serialise(msg)) == msg

    def test_status_error(self):
        msg = make_status("error")
        assert deserialise(serialise(msg)) == msg


class TestMessageFactories:
    """Factory functions produce correct message shapes."""

    def test_blink_event_fields(self):
        msg = make_blink_event(1000, 0.18, duration_ms=120)
        assert msg["type"] == "blink_event"
        assert msg["timestamp"] == 1000
        assert msg["ear_value"] == 0.18
        assert msg["duration_ms"] == 120

    def test_tracking_status_fields(self):
        msg = make_tracking_status(True, 0.95, 2000)
        assert msg["type"] == "tracking_status"
        assert msg["face_detected"] is True
        assert msg["quality"] == 0.95
        assert msg["timestamp"] == 2000

    def test_preview_frame_fields(self):
        msg = make_preview_frame("abc123", 320, 240, 3000)
        assert msg["type"] == "preview_frame"
        assert msg["data"] == "abc123"
        assert msg["width"] == 320
        assert msg["height"] == 240
        assert msg["timestamp"] == 3000

    def test_camera_list_fields(self):
        cameras = [{"index": 0, "name": "Cam"}]
        msg = make_camera_list(cameras)
        assert msg["type"] == "camera_list"
        assert msg["cameras"] == cameras

    def test_error_fields(self):
        msg = make_error("TEST_ERROR", "Something broke")
        assert msg["type"] == "error"
        assert msg["code"] == "TEST_ERROR"
        assert msg["message"] == "Something broke"

    def test_status_fields(self):
        msg = make_status("running")
        assert msg["type"] == "status"
        assert msg["state"] == "running"


class TestTypeConstants:
    """COMMAND_TYPES and EVENT_TYPES contain the expected values."""

    def test_command_types(self):
        assert COMMAND_TYPES == {"start", "stop", "set_preview", "list_cameras"}

    def test_event_types(self):
        expected = {
            "blink_event", "tracking_status", "preview_frame",
            "camera_list", "error", "status",
        }
        assert EVENT_TYPES == expected

    def test_no_overlap(self):
        assert COMMAND_TYPES.isdisjoint(EVENT_TYPES)