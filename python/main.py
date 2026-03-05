"""Entry point: reads stdin commands, runs camera + detection loop, writes events to stdout."""

import sys
import threading
import time
import cv2

from python.config import load_config
from python.camera import Camera, list_cameras
from python.detector import FaceDetector
from python.blink_engine import BlinkEngine
from python.protocol import (
    deserialise_command,
    make_blink_event,
    make_camera_list,
    make_error,
    make_status,
    make_tracking_status,
    serialise,
)


class BlinkService:
    """Manages the camera + detection loop, controlled by stdin commands."""

    def __init__(self, stdin=None, stdout=None, stderr=None):
        self._stdin = stdin or sys.stdin
        self._stdout = stdout or sys.stdout
        self._stderr = stderr or sys.stderr

        self._running = False
        self._preview_enabled = False
        self._loop_thread = None
        self._stop_event = threading.Event()

        self._camera = None
        self._detector = None
        self._engine = None

        self._fps_counter = _FpsCounter()

        load_config()

    def run(self):
        """Read stdin line by line and dispatch commands. Blocks until EOF."""
        for line in self._stdin:
            line = line.strip()
            if not line:
                continue
            try:
                command = deserialise_command(line)
            except ValueError as e:
                self._emit(make_error("INVALID_COMMAND", str(e)))
                continue

            self._dispatch(command)

    def _dispatch(self, command):
        """Route a command to the appropriate handler."""
        cmd_type = command["type"]

        if cmd_type == "start":
            self._handle_start(command)
        elif cmd_type == "stop":
            self._handle_stop()
        elif cmd_type == "set_preview":
            self._handle_set_preview(command)
        elif cmd_type == "list_cameras":
            self._handle_list_cameras()

    def _handle_start(self, command):
        """Start the camera + detection loop."""
        if self._running:
            self._emit(make_error("ALREADY_RUNNING", "Monitoring is already running"))
            return

        camera_index = command.get("camera_index", 0)
        self._preview_enabled = command.get("preview_enabled", False)

        self._camera = Camera(index=camera_index)
        if not self._camera.open():
            self._emit(make_error(
                "CAMERA_OPEN_FAILED",
                f"Could not open camera at index {camera_index}",
            ))
            self._camera = None
            return

        self._detector = FaceDetector()
        self._engine = BlinkEngine()
        self._fps_counter.reset()
        self._stop_event.clear()
        self._running = True

        self._emit(make_status("running"))

        self._loop_thread = threading.Thread(target=self._detection_loop, daemon=True)
        self._loop_thread.start()

    def _handle_stop(self):
        """Stop the detection loop and release resources."""
        if not self._running:
            self._emit(make_error("NOT_RUNNING", "Monitoring is not running"))
            return

        self._stop_event.set()
        if self._loop_thread is not None:
            self._loop_thread.join(timeout=5.0)
            self._loop_thread = None

        self._cleanup()
        self._running = False
        self._emit(make_status("stopped"))

    def _handle_set_preview(self, command):
        """Toggle preview frame output."""
        self._preview_enabled = command.get("enabled", False)

    def _handle_list_cameras(self):
        """Enumerate available cameras and emit the list."""
        cameras = list_cameras()
        self._emit(make_camera_list(cameras))

    def _detection_loop(self):
        """Capture frames and run detection until stopped."""
        last_tracking_time = 0.0

        try:
            while not self._stop_event.is_set():
                ok, frame = self._camera.read()
                if not ok:
                    self._emit(make_error("CAMERA_READ_FAILED", "Failed to read frame from camera"))
                    break

                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                now_ms = time.time() * 1000.0
                detection = self._detector.process(frame_rgb, now_ms)
                events = self._engine.update(detection)

                self._fps_counter.tick()

                for event in events:
                    if event["type"] == "blink_event":
                        self._emit(make_blink_event(
                            timestamp=event["timestamp"],
                            ear_value=event["ear"],
                            duration_ms=None,
                        ))
                    elif event["type"] == "tracking_status":
                        # Rate-limit tracking_status to ~1/s
                        if (now_ms - last_tracking_time) >= 1000.0:
                            self._emit(make_tracking_status(
                                face_detected=event["face_detected"],
                                quality=detection.get("quality") or 0.0,
                                fps=self._fps_counter.fps(),
                                timestamp=event["timestamp"],
                            ))
                            last_tracking_time = now_ms

        except Exception as e:
            self._log(f"Detection loop error: {e}")
            self._emit(make_error("DETECTION_ERROR", str(e)))
        finally:
            if self._running:
                self._cleanup()
                self._running = False
                self._emit(make_status("stopped"))

    def _cleanup(self):
        """Release camera and detector resources."""
        if self._camera is not None:
            self._camera.release()
            self._camera = None
        if self._detector is not None:
            self._detector.close()
            self._detector = None
        self._engine = None

    def _emit(self, message):
        """Write a message to stdout as a JSON line."""
        try:
            self._stdout.write(serialise(message))
            self._stdout.flush()
        except (BrokenPipeError, OSError):
            pass

    def _log(self, text):
        """Write diagnostic text to stderr."""
        try:
            print(text, file=self._stderr, flush=True)
        except (BrokenPipeError, OSError):
            pass


class _FpsCounter:
    """Simple FPS counter using a rolling window."""

    def __init__(self, window=30):
        self._window = window
        self._timestamps = []

    def tick(self):
        now = time.time()
        self._timestamps.append(now)
        if len(self._timestamps) > self._window:
            self._timestamps = self._timestamps[-self._window:]

    def fps(self):
        if len(self._timestamps) < 2:
            return 0.0
        elapsed = self._timestamps[-1] - self._timestamps[0]
        if elapsed <= 0:
            return 0.0
        return (len(self._timestamps) - 1) / elapsed

    def reset(self):
        self._timestamps = []


def main():
    service = BlinkService()
    service.run()


if __name__ == "__main__":
    main()