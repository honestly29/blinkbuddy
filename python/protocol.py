"""Helpers for converting messages to and from the JSON-line format used
between Electron and the Python service.

Messages travel as one JSON object per line of stdin/stdout. The
serialise() function packs a Python dict into that format (compact JSON
plus a trailing newline); deserialise() unpacks a line back into a dict.

Callers use the make_*() helpers (one per event type) instead of building dicts by hand, the helpers guarantee the right field names and types every time."
"""

import json

# All valid command types (Electron -> Python)
COMMAND_TYPES = frozenset({"start", "stop", "set_preview", "list_cameras"})

# All valid event types (Python -> Electron)
EVENT_TYPES = frozenset({
    "blink_event",
    "tracking_status",
    "preview_frame",
    "camera_list",
    "error",
    "status",
})


def serialise(message):
    """Serialise a message dict to a single JSON line.

    Produces compact JSON (no whitespace between fields) plus a trailing
    newline, which is the line separator the Electron side parses on.

    Args:
        message: A dict with at least a 'type' key.

    Returns:
        A JSON string terminated by '\\n', ready to write to stdout.

    Raises:
        ValueError: If the message is not a dict or has no 'type' key.
    """
    if not isinstance(message, dict):
        raise ValueError("Message must be a dict")
    if "type" not in message:
        raise ValueError("Message must have a 'type' key")
    return json.dumps(message, separators=(",", ":")) + "\n"


def deserialise(line):
    """Parse a single JSON line back into a message dict.

    Strips any trailing whitespace or newlines internally, so callers
    can pass lines straight from stdin without cleaning them up first.
    Validates that the parsed result is a dict with a 'type' field;
    anything else raises ValueError.

    Args:
        line: A string containing a single JSON object (with or without
              trailing newline).

    Returns:
        A dict with at least a 'type' key.

    Raises:
        ValueError: If the line is not valid JSON, is not a dict, or has
                    no 'type' key.
    """
    stripped = line.strip()
    if not stripped:
        raise ValueError("Empty line")

    try:
        message = json.loads(stripped)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}") from e

    if not isinstance(message, dict):
        raise ValueError("Message must be a JSON object")
    if "type" not in message:
        raise ValueError("Message must have a 'type' key")

    return message


def deserialise_command(line):
    """Parse and validate a command from Electron.

    Wraps deserialise() with an extra check that the message's type is
    one of the four known command types. Anything else (typo, unknown
    command) raises ValueError so the caller can emit an INVALID_COMMAND
    error rather than silently dispatching nothing.

    Args:
        line: A JSON line.

    Returns:
        A dict with a valid command 'type'.

    Raises:
        ValueError: If the line is invalid or the type is not a known command.
    """
    message = deserialise(line)
    if message["type"] not in COMMAND_TYPES:
        raise ValueError(f"Unknown command type: {message['type']}")
    return message


def make_blink_event(timestamp, ear_value, duration_ms=None):
    """Create a blink_event message.

    Args:
        timestamp: Unix timestamp in milliseconds.
        ear_value: EAR at blink peak.
        duration_ms: Optional blink duration in milliseconds.
    """
    msg = {
        "type": "blink_event",
        "timestamp": timestamp,
        "ear_value": ear_value,
        "duration_ms": duration_ms,
    }
    return msg


def make_tracking_status(face_detected, quality, timestamp):
    """Create a tracking_status message.

    Args:
        face_detected: Whether a face is currently tracked.
        quality: MediaPipe confidence 0-1.
        timestamp: Unix timestamp in milliseconds.
    """
    return {
        "type": "tracking_status",
        "face_detected": face_detected,
        "quality": quality,
        "timestamp": timestamp,
    }


def make_preview_frame(data, width, height, timestamp):
    """Create a preview_frame message.

    Args:
        data: Base64-encoded JPEG string.
        width: Frame width in pixels.
        height: Frame height in pixels.
        timestamp: Unix timestamp in milliseconds.
    """
    return {
        "type": "preview_frame",
        "data": data,
        "width": width,
        "height": height,
        "timestamp": timestamp,
    }


def make_camera_list(cameras):
    """Create a camera_list message.

    Args:
        cameras: List of dicts with 'index' and 'name' keys.
    """
    return {
        "type": "camera_list",
        "cameras": cameras,
    }


def make_error(code, message):
    """Create an error message.

    Args:
        code: Error code string (e.g. 'CAMERA_OPEN_FAILED').
        message: Human-readable error description.
    """
    return {
        "type": "error",
        "code": code,
        "message": message,
    }


def make_status(state):
    """Create a status message.

    Args:
        state: One of 'running', 'stopped', 'error'.
    """
    return {
        "type": "status",
        "state": state,
    }