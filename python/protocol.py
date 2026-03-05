"""JSON Lines serialisation and deserialisation helpers for IPC protocol."""

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
    """Serialise a message dict to a JSON Lines string (with trailing newline).

    Args:
        message: A dict with at least a 'type' key.

    Returns:
        A JSON string terminated by '\\n'.

    Raises:
        ValueError: If the message is not a dict or has no 'type' key.
    """
    if not isinstance(message, dict):
        raise ValueError("Message must be a dict")
    if "type" not in message:
        raise ValueError("Message must have a 'type' key")
    return json.dumps(message, separators=(",", ":")) + "\n"


def deserialise(line):
    """Deserialise a JSON Lines string into a message dict.

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
    """Deserialise and validate a command (Electron -> Python).

    Args:
        line: A JSON Lines string.

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
        timestamp: Epoch milliseconds.
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


def make_tracking_status(face_detected, quality, fps, timestamp):
    """Create a tracking_status message.

    Args:
        face_detected: Whether a face is currently tracked.
        quality: MediaPipe confidence 0-1.
        fps: Current processing FPS.
        timestamp: Epoch milliseconds.
    """
    return {
        "type": "tracking_status",
        "face_detected": face_detected,
        "quality": quality,
        "fps": fps,
        "timestamp": timestamp,
    }


def make_preview_frame(data, width, height, timestamp):
    """Create a preview_frame message.

    Args:
        data: Base64-encoded JPEG string.
        width: Frame width in pixels.
        height: Frame height in pixels.
        timestamp: Epoch milliseconds.
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