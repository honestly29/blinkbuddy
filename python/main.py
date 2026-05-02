"""Entry point: reads stdin commands, runs camera + detection loop, writes events to stdout."""

import sys
import threading
import time
import cv2

from python.config import load_config
from python.camera import Camera
from python.camera_enumeration import list_cameras
from python.camera_permission import check_camera_permission
from python.detector import FaceDetector
from python.blink_engine import BlinkEngine
from python.preview import render_preview
from python.protocol import (
    deserialise_command,
    make_blink_event,
    make_camera_list,
    make_error,
    make_preview_frame,
    make_status,
    make_tracking_status,
    serialise,
)


class BlinkService:
    """Manages the camera + detection loop, controlled by stdin commands.

    Reads JSON commands from stdin (start, stop, set_preview, list_cameras)
    and writes JSON events to stdout (blink_event, tracking_status, preview_frame, etc.).
    The detection loop runs in a background thread to keep stdin responsive.
    """

    def __init__(self, stdin=None, stdout=None, stderr=None):
        # Allow dependency injection of streams for testing.
        # In production, these default to the real sys.stdin/stdout/stderr.
        self._stdin = stdin or sys.stdin
        self._stdout = stdout or sys.stdout
        self._stderr = stderr or sys.stderr

        self._running = False
        self._preview_enabled = False
        self._loop_thread = None
        self._stop_event = threading.Event()  # Thread-safe signal to stop the detection loop

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
        """Start the camera + detection loop in a background thread."""
        if self._running:
            self._emit(make_error("ALREADY_RUNNING", "Monitoring is already running"))
            return

        camera_index = command.get("camera_index", 0)
        self._preview_enabled = command.get("preview_enabled", False)

        # Open the camera; emit an error and exit if it fails
        self._camera = Camera(index=camera_index)
        if not self._camera.open():
            # On macOS, check whether the failure was caused by permission denial
            permission = check_camera_permission()
            if permission == "denied":
                self._emit(make_error(
                    "CAMERA_PERMISSION_DENIED",
                    "Camera access denied. Please grant permission in "
                    "System Settings > Privacy & Security > Camera.",
                ))
            else:
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

        # Run the detection loop in a daemon thread so it doesn't block stdin reading. 
        self._loop_thread = threading.Thread(target=self._detection_loop, daemon=True)
        self._loop_thread.start()

    def _handle_stop(self):
        """Stop the detection loop and release camera/detector resources."""
        if not self._running:
            self._emit(make_error("NOT_RUNNING", "Monitoring is not running"))
            return

        # Signal the detection loop thread to exit
        self._stop_event.set()
        if self._loop_thread is not None:
            self._loop_thread.join(timeout=5.0)  # Wait up to 5s for clean shutdown
            self._loop_thread = None

        self._cleanup()
        self._running = False
        self._emit(make_status("stopped"))

    def _handle_set_preview(self, command):
        """Toggle preview frame output. Can be called while running."""
        self._preview_enabled = command.get("enabled", False)

    def _handle_list_cameras(self):
        """Enumerate available cameras and emit the list."""
        cameras = list_cameras()
        self._emit(make_camera_list(cameras))

    def _detection_loop(self):
        """Capture frames and run detection until stopped.

        This runs in a background thread. It reads frames from the camera,
        processes them through MediaPipe face detection, generates blink
        and tracking events, and optionally emits preview frames.
        """
        last_tracking_time = 0.0  # Wall-clock ms of last tracking_status emission
        last_preview_time = 0.0  # Wall-clock seconds of last preview_frame emission

        try:
            while not self._stop_event.is_set():
                ok, frame = self._camera.read()
                if not ok:
                    self._emit(make_error("CAMERA_READ_FAILED", "Failed to read frame from camera"))
                    break
                
                # Convert BGR (OpenCV) to RGB (MediaPipe)
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                now_ms = time.time() * 1000.0  # Epoch milliseconds for IPC timestamps
                detection = self._detector.process(frame_rgb, now_ms)
                events = self._engine.update(detection)

                self._fps_counter.tick()
                
                # -- Emit blink and tracking events from the blink engine --
                for event in events:
                    if event["type"] == "blink_event":
                        self._emit(make_blink_event(
                            timestamp=event["timestamp"],
                            ear_value=event["ear"],
                            duration_ms=None,
                        ))
                    elif event["type"] == "tracking_status":
                        # Rate-limit tracking_status to ~1 per second to avoid flooding the IPC channel with redundant updates
                        if (now_ms - last_tracking_time) >= 1000.0:
                            self._emit(make_tracking_status(
                                face_detected=event["face_detected"],
                                quality=detection.get("quality") or 0.0,
                                fps=self._fps_counter.fps(),
                                timestamp=event["timestamp"],
                            ))
                            last_tracking_time = now_ms

                # -- Preview frame emission (~10 FPS) --
                # This block sits OUTSIDE the event loop above because preview emission is independent of blink/tracking events.
                # 
                # Three conditions must all be true:
                #   1. User has toggled preview on
                #   2. A face was detected 
                #   3. At least 100ms since the last preview 
                if self._preview_enabled and detection["landmarks"] is not None:
                    now_s = time.time()  
                    if (now_s - last_preview_time) >= 0.1:  # 0.1s = ~10 FPS
                        preview = render_preview(frame, detection["landmarks"])
                        self._emit(make_preview_frame(
                            data=preview["data"],
                            width=preview["width"],
                            height=preview["height"],
                            timestamp=now_ms,
                        ))
                        last_preview_time = now_s

        except Exception as e:
            self._log(f"Detection loop error: {e}")
            self._emit(make_error("DETECTION_ERROR", str(e)))
        finally:
            # Ensure resources are cleaned up even if the loop exits via exception
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
        """Write a message to stdout as a JSON line.

        Catches BrokenPipeError/OSError because the Electron parent process may
        close stdin/stdout before the Python process finishes writing.
        """
        try:
            self._stdout.write(serialise(message))
            self._stdout.flush()
        except (BrokenPipeError, OSError):
            pass

    def _log(self, text):
        """Write diagnostic text to stderr (not parsed by Electron)."""
        try:
            print(text, file=self._stderr, flush=True)
        except (BrokenPipeError, OSError):
            pass


class _FpsCounter:
    """Simple FPS counter using a rolling window of timestamps.
    
    Records the wall-clock time of each tick() call, keeps the last N
    timestamps, and calculates FPS as (count - 1) / elapsed_time.
    """

    def __init__(self, window=30):
        self._window = window  # Number of recent timestamps to keep
        self._timestamps = []

    def tick(self):
        """Record the current time."""
        now = time.time()
        self._timestamps.append(now)
        # Trim to the rolling window size
        if len(self._timestamps) > self._window:
            self._timestamps = self._timestamps[-self._window:]

    def fps(self):
        """Calculate the current frames per second."""
        if len(self._timestamps) < 2:
            return 0.0
        elapsed = self._timestamps[-1] - self._timestamps[0]
        if elapsed <= 0:
            return 0.0
        return (len(self._timestamps) - 1) / elapsed

    def reset(self):
        """Clear all recorded timestamps."""
        self._timestamps = []


def main():
    service = BlinkService()
    service.run()


if __name__ == "__main__":
    main()