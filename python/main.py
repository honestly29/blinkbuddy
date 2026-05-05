"""Entry point: reads stdin commands, runs camera + detection loop, writes events to stdout."""

import sys
import threading
import time
import cv2

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
    and writes JSON events to stdout (blink_event, tracking_status,
    preview_frame, etc.). The detection loop runs in a background thread
    so the main thread can keep reading commands from stdin while
    detection is in progress.
    """

    def __init__(self, stdin=None, stdout=None, stderr=None):
        # Parameters default to None; when None, we fall back to the real
        # sys.stdin/stdout/stderr. Tests can pass in fakes to capture output
        # and feed scripted input.
        self._stdin = stdin or sys.stdin
        self._stdout = stdout or sys.stdout
        self._stderr = stderr or sys.stderr

        self._running = False
        self._preview_enabled = False
        self._loop_thread = None
        # Python threads can't be stopped from outside, so the main thread
        # sets this flag to ask the detection loop to stop, and the loop
        # checks it at the top of every iteration and exits cleanly when set.
        self._stop_event = threading.Event()  

        self._camera = None
        self._detector = None
        self._engine = None



    def run(self):
        """Read stdin line by line and dispatch commands. Returns when
        stdin closes (Electron disconnected). Lines that aren't valid
        JSON commands get reported back as INVALID_COMMAND errors and
        the loop keeps running.
        """
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
        """Open the camera, set up detection, and launch the detection loop
        on a background thread. Emits status:running on success, or an
        error event if the camera can't be opened.
        """
        if self._running:
            self._emit(make_error("ALREADY_RUNNING", "Monitoring is already running"))
            return

        camera_index = command.get("camera_index", 0)
        self._preview_enabled = command.get("preview_enabled", False)

        self._camera = Camera(index=camera_index)
        if not self._camera.open():
            # On macOS, check whether open camera failure was caused by permission 
            # denial rather than a missing device, and report that case
            # before falling back to a generic "open failed".
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
        self._stop_event.clear()
        self._running = True

        self._emit(make_status("running"))

        # Run the detection loop on a daemon thread. Daemon threads die with
        # the process instead of keeping it alive. So if Electron crashes or
        # force-quits without sending a stop command, the detection thread dies 
        # cleanly along with the Python process, instead of leaving a zombie 
        # process behind still using the camera.
        self._loop_thread = threading.Thread(target=self._detection_loop, daemon=True)
        self._loop_thread.start()

    def _handle_stop(self):
        """Stop the detection loop, wait for the thread to exit, and release
        camera/detector resources. Emits status:stopped on success, or an
        error if monitoring wasn't running.
        """
        if not self._running:
            self._emit(make_error("NOT_RUNNING", "Monitoring is not running"))
            return

        # 5s timeout is a safety net so _handle_stop can't block forever if
        # the detection thread gets stuck and never exits.
        self._stop_event.set()
        if self._loop_thread is not None:
            self._loop_thread.join(timeout=5.0)  
            self._loop_thread = None

        self._cleanup()
        self._running = False
        self._emit(make_status("stopped"))

    def _handle_set_preview(self, command):
        """Turn preview frame output on or off. Can be called while monitoring 
        is running."""
        self._preview_enabled = command.get("enabled", False)

    def _handle_list_cameras(self):
        """Enumerate available cameras and emit the list."""
        cameras = list_cameras()
        self._emit(make_camera_list(cameras))

    def _detection_loop(self):
        """Capture frames and run detection until stopped.

        Runs on a background thread. Reads frames from the camera, processes
        them through MediaPipe face detection, generates blink and tracking
        events, and optionally emits preview frames.
        """
        # Tracking in ms (matches IPC timestamps), preview in
        # seconds (matches time.time() and the 10 FPS check below).
        last_tracking_time = 0.0  
        last_preview_time = 0.0  

        try:
            while not self._stop_event.is_set():
                # Stop the loop on read failure rather than retrying forever
                # on a broken camera and flooding Electron with errors.
                ok, frame = self._camera.read()
                if not ok:
                    self._emit(make_error("CAMERA_READ_FAILED", "Failed to read frame from camera"))
                    break
                
                # OpenCV gives us frames in BGR order; MediaPipe expects RGB.
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                # Current time as a Unix timestamp in milliseconds. Used on outgoing
                # events so Python and the renderer can compare timestamps directly
                # without converting.
                now_ms = time.time() * 1000.0  

                detection = self._detector.process(frame_rgb, now_ms)
                events = self._engine.update(detection)

                
                # -- Emit blink and tracking events from the blink engine --
                for event in events:
                    # Blink events aren't rate-limited because each blink
                    # matters and needs precise timing
                    if event["type"] == "blink_event":
                        self._emit(make_blink_event(
                            timestamp=event["timestamp"],
                            ear_value=event["ear"],
                            duration_ms=None,
                        ))
                    elif event["type"] == "tracking_status":
                        # A tracking event is produced every frame (~30/sec), but
                        # consumers (state machine + status panel) only needs an 
                        # occasional refresh. Cap the rate at one per second so we
                        # don't flood the IPC channel.
                        if (now_ms - last_tracking_time) >= 1000.0:
                            self._emit(make_tracking_status(
                                face_detected=event["face_detected"],
                                quality=detection.get("quality") or 0.0,
                                timestamp=event["timestamp"],
                            ))
                            last_tracking_time = now_ms

                # --- Preview frame emission ---
                # Separate from the event loop above because previews come from the
                # raw frame, not from engine events. Only emit when preview is on,
                # a face was detected, and at least 100ms have passed since the last
                # preview (capped at ~10 FPS, plenty for visual feedback).
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
            # Clean up even if the loop exited via exception, otherwise the
            # camera and detector would stay open until the Python process exits.
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
        """Send an event to Electron as a JSON line on stdout.

        Catches errors silently because Electron may close the connection to
        Python during shutdown while Python is still sending events. Without
        the catch, the service would crash on its way out.
        """
        try:
            self._stdout.write(serialise(message))
            self._stdout.flush()
        except (BrokenPipeError, OSError):
            pass

    def _log(self, text):
        """Send diagnostic text to stderr. Separate from the events
        Electron parses on stdout, used for debug messages a developer
        might want to see in Electron's log file.
        """
        try:
            print(text, file=self._stderr, flush=True)
        except (BrokenPipeError, OSError):
            pass

def main():
    service = BlinkService()
    service.run()


if __name__ == "__main__":
    main()