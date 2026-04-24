# BlinkBuddy

> A privacy-first desktop app that monitors your blink rate through your webcam and gently reminds you to blink when you go too long without blinking, helping reduce the effects of Computer Vision Syndrome.

BlinkBuddy uses real-time facial landmark detection to track blink frequency during screen use, fires customisable reminders when blink rate drops too low, and provides a statistics dashboard so users can review their habits over time. All processing happens locally on your device: no video, frames, or personal data leave the machine.

---

## Core features

- **Real-time blink detection** using MediaPipe Face Mesh and OpenCV, running as a local Python service. Eye Aspect Ratio (EAR) is computed per frame to detect blinks.
- **Customisable blink reminders** with four independently toggleable reminder strategies: a window overlay, a subtle screen edge glow, a corner popup, and an audio cue. Any combination can be active at once.
- **Adjustable blink window** (default 8 seconds). If you go longer than the window without blinking, a reminder fires and clears automatically as soon as your next blink is detected.
- **20-20-20 break reminders** implementing the guideline of looking at something 20 feet away for 20 seconds every 20 minutes.
- **Statistics dashboard** with overview cards (average blink rate, total sessions, reminders fired, healthy session rate), a blink rate trend chart showing the last 8 days of data, and a grouped session history.
- **CSV export** of session data for users who want to analyse their history externally.
- **Privacy by design**: all facial landmark detection runs locally. No frames are recorded, stored, or transmitted. The optional camera preview streams only while explicitly enabled.

---

## Installing the packaged build (recommended)

> **Requires: macOS on Apple Silicon (M1, M2, M3, or M4).** The packaged `.dmg` is built for arm64 only. If you are on an Intel Mac, please use the "Running from source" path below.

### Step 1: Install

1. Download `BlinkBuddy-0.1.0-arm64.dmg` 
2. Double-click the `.dmg` file.
3. Drag `BlinkBuddy` into the Applications folder.
4. Close the `.dmg` window.

### Step 2: Bypass Gatekeeper

BlinkBuddy is not signed with an Apple Developer certificate. On first launch, macOS will refuse to open it with a message like "BlinkBuddy is damaged and can't be opened" or "cannot be opened because Apple cannot check it for malicious software". The app is not actually damaged; this is macOS being cautious about unsigned software.

To bypass:

1. Open Terminal (Applications -> Utilities -> Terminal).
2. Run this command exactly:
   ```bash
   xattr -cr /Applications/BlinkBuddy.app
   ```
3. Enter your password if prompted.
4. Open BlinkBuddy normally by double-clicking it in Applications.

### Step 3: Grant camera permission

On first launch, macOS will prompt for camera access. Click **Allow**. Without camera access, BlinkBuddy cannot function, though if you accidentally deny the prompt the app will show a clear error banner directing you to System Settings to grant permission manually (System Settings -> Privacy & Security -> Camera -> toggle BlinkBuddy on). You may need to quit and reopen the app after granting permission.

---

## Running from source

Use this path if you want to inspect the code, rebuild the packaged binary, or attempt to run BlinkBuddy on a machine other than Apple Silicon macOS (untested).

### Prerequisites

- **Node.js** 22 LTS or later (developed on Node 22; earlier versions 18+ likely work but are untested)
- **Python** 3.10, 3.11, or 3.12 (MediaPipe does not currently support 3.13)
- **npm** (bundled with Node.js)
- A functional webcam

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/honestly29/blinkbuddy.git
cd blinkbuddy

# 2. Install Node dependencies
npm install

# 3. Create and activate a Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 4. Install Python dependencies (runtime + test)
pip install --upgrade pip
pip install -r python/requirements.txt
pip install pytest

# 5. Download the MediaPipe Face Landmarker model (~6 MB)
python scripts/setup_model.py
```

### Running

```bash
# Start the app in development mode
npm run dev
```

This launches the Vite dev server, which starts Electron via `vite-plugin-electron`. The main process spawns the Python service as a subprocess, and the BlinkBuddy window opens. Renderer changes hot-reload automatically. Changes to the Electron main process trigger an automatic Electron restart. Changes to the Python service require manually stopping and re-running `npm run dev`.

**First-run note:** The first time you click Start Monitoring,
expect roughly 25 seconds before face detection activates. During
this time the monitoring status will show "No face detected" even
if you are facing the camera. This is the camera and detection
pipeline initialising. Subsequent starts in the same session are
much faster.

### Available npm scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the app in development mode |
| `npm run build` | Compile the TypeScript renderer via Vite |
| `npm test` | Run the TypeScript test suite via Vitest |
| `npm run build:python` | Bundle the Python service into a standalone executable with PyInstaller |
| `npm run build:renderer` | Compile the TypeScript renderer via Vite |
| `npm run build:electron` | Package the `.app` and `.dmg` via electron-builder |
| `npm run dist` | Produce a packaged `.dmg`: runs `build:python`, `build:renderer`, and `build:electron` in sequence |
| `npm run populate-test-data` | Seed the session history with synthetic test sessions (useful for UI testing) |

### Running the tests

```bash
# TypeScript tests (Vitest)
npm test

# Python tests (pytest)
.venv/bin/python -m pytest test/python/ -v
```

---

## How to use BlinkBuddy

1. **Choose your camera and reminder settings.** Open the Settings tab. Pick your camera from the dropdown. Choose which reminder strategies you want active: window overlay, screen edge glow, corner popup, audio cue, or any combination. Adjust the blink window (default 8 seconds) if desired.
2. **Start monitoring.** Go to the Monitor tab and click "Start Monitoring". The face detection indicator turns green when your face is detected. Your blink count and blinks-per-minute update in real time.
3. **Enable camera preview (optional).** Click "Show camera preview" to see the live webcam feed with face mesh overlay. This is useful for confirming that detection is working. 
4. **React to reminders.** When you go longer than the blink window without blinking, the reminders you enabled will fire. Blinking clears them automatically.
5. **Review your stats.** After using BlinkBuddy for a while, check the Stats tab to see your overall blink rate, trend over the last 8 days, and session history grouped by date.
6. **Read the Tips & Info tab** for background on Computer Vision Syndrome, the 20-20-20 rule, and ergonomic recommendations.

---

## Where BlinkBuddy stores data

All data is stored locally. Nothing is transmitted off-device.

On macOS, settings and history are stored in:
```
~/Library/Application Support/BlinkBuddy/
```

Three files live there:
- `settings.json` - user settings (blink window, camera index, preview toggle, 20-20-20 toggle)
- `sessions.json` - session history log (per-session summaries)
- `reminder-preferences.json` - per-strategy reminder configuration

**No video, frames, or raw biometric data is ever persisted.** Only derived statistics (blink counts, timestamps, durations, configuration) are saved.

From within the app, the Settings tab includes a "Data Management" panel with two buttons: **Export to CSV** (saves your session history as a spreadsheet file) and **Clear All Data** (permanently deletes all stored sessions).

---

## Known limitations

BlinkBuddy is a working prototype that demonstrates the core idea of blink-based digital wellbeing support. It is not a finished product. The sections below are an honest account of what is not yet implemented, what is partially implemented, and known bugs in implemented features.

### Detection

- **[BUG] Low-light detection bug.** In low-light conditions there is a known bug where the face-detection indicator can show green (i.e. the app has locked onto a face) while blink detection fails to register any blinks. The app does not currently detect this "face visible but blinks invisible" state and cannot warn the user. In good lighting conditions, detection works reliably.
- **Incomplete blink detection is not implemented.** The literature (Al-Mohtaseb et al., 2021) identifies incomplete blinks as a contributor to dry eye symptoms. BlinkBuddy's current pipeline counts full blinks only. The blink-engine module is architected to accommodate a second detection type in future (the discriminator pattern is already in place), but implementing reliable incomplete-blink detection was out of scope for this project.
- **No personalised calibration.** The blink threshold (Eye Aspect Ratio) uses a fixed value across all users. This should perform adequately for most users but may be less reliable for users whose natural eye shape or resting EAR differs from the population average.
- **Tracking quality reported but not used.** MediaPipe Face Landmarker does not expose a per-frame confidence metric in its current API, so the detector emits a fixed quality value. The infrastructure to suppress reminders on low-quality tracking is in place but the quality threshold is never crossed in practice.
  

### Behavioural scope

- **20-20-20 compliance is prompt-based, not verified.** The app can tell whether a break was prompted but cannot confirm whether the user actually looked away from the screen. 
- **No posture, distance, or screen-angle tracking.** These are known contributors to CVS per the literature but are left as future work.

### Platform

- **Packaged build is macOS Apple Silicon only.** The `.dmg` is built for arm64. A universal or cross-platform build was feasible but deprioritised in favour of other features given project time constraints.
- **Only tested on macOS Apple Silicon.** The codebase is built on cross-platform technologies (Electron, Node, Python, MediaPipe, OpenCV), so running from source on Windows, Linux, or Intel Mac may work, but none of these configurations have been tested. Source install on other platforms should be considered experimental.
- **Unsigned binary.** The packaged app requires a one-time Gatekeeper bypass on macOS (see installation instructions). Code signing requires a paid Apple Developer Programme membership.
- **[BUG] Popup reminders steal focus on first activation.** The corner popup, screen edge glow, and 20-20-20 break popup all pull the user out of any fullscreen application the first time they fire in a session. Subsequent activations within the same session behave correctly, appearing over fullscreen apps without stealing focus. The cause is likely Electron's default auto-show behaviour on first content load. An attempted fix introduced new issues and was reverted to preserve stability for the project build submission. The reminders remain functional, this is a UX disruption.
- **[BUG] Screen edge glow offset on macOS.** The screen edge glow reminder is intended to cover all four edges of the screen. On macOS, the glow does not account for the dock's position: when the dock is visible on the bottom (or side), the glow on that edge is pushed inward by the dock's width or height, leaving a visible gap between the glow and the actual screen edge. This persists even when windows are in full-screen mode. The reminder is still visible and functional but the visuals are incomplete on the docked edge.

### Clinical and evaluation

- **BlinkBuddy is not a medical device.** It does not diagnose, treat, or prevent Computer Vision Syndrome or any other condition. It is a wellness and awareness tool.
- **No formal user study has been completed.** User testing is scheduled separately from the prototype submission. Reports of real-world efficacy will come from that work, not from the software in its current state.

---

## Architecture overview

BlinkBuddy is a modular monolith: a single desktop application with clearly separated internal modules. The high-level structure:

- **Electron main process** (Node.js, `src/main/`) orchestrates the app lifecycle, spawns the Python service, and handles IPC, settings persistence, reminder strategy coordination, and OS integration (notifications, audio playback). A `SessionManager` acts as the central orchestrator, wiring domain logic to Python events and pushing state updates to the renderer.
- **Preload script** (`src/main/preload.ts`) exposes a typed `blinkBuddy` API to the renderer via Electron's `contextBridge`, with `nodeIntegration: false` and `contextIsolation: true`. The renderer has no direct access to Node or Electron APIs; all main-process capabilities go through this bridge.
- **Renderer process** (React + TypeScript + Tailwind CSS, `src/renderer/`) handles all UI rendering, user input, and visual state. It communicates with the main process only via the preload bridge.
- **Domain layer** (`src/domain/`) contains framework-agnostic business logic: the blink window rule, reminder state transitions, the 20-20-20 break timer, and session statistics. No files here import Electron, React, or Node APIs.
- **Reminder strategies and dispatcher** (`src/main/reminder-strategies/`) use a plugin-style design. Each reminder strategy (overlay, screen edge glow, corner popup, audio cue) is an independent module that registers with a shared `ReminderDispatcher`. When the blink window elapses without a blink, the dispatcher fires a start event to every registered strategy; when the user blinks, it fires a stop event. Strategies can be toggled independently by the user, and the same dispatcher pattern is reused for 20-20-20 break reminders.
- **Python inference service** (`python/`) runs as a subprocess. It captures webcam frames via OpenCV, runs facial landmark detection via MediaPipe's Face Landmarker Tasks API, computes blink events via Eye Aspect Ratio, and emits events to the main process over a JSON Lines protocol on stdin/stdout.
- **Shared types** (`src/shared/`) define the IPC protocol (`ipc-messages.ts` for renderer<->main, `protocol.ts` for main<->Python) so message formats stay consistent across all layers.

---

## Project structure

```
blinkbuddy/
├── blinkbuddy_service.py          # PyInstaller entry shim
├── blinkbuddy-service.spec        # PyInstaller build spec
├── index.html                     # Vite entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.js
├── postcss.config.js
├── requirements-build.txt         # PyInstaller build dependencies
├── python/                        # Python inference service
│   ├── main.py                      (entry point)
│   ├── detector.py                  (MediaPipe integration and EAR computation)
│   ├── blink_engine.py              (blink state machine consuming EAR values)
│   ├── camera.py                    (OpenCV camera capture)
│   ├── preview.py                   (preview frame encoding)
│   ├── protocol.py                  (event schema)
│   ├── config.py                    (detection parameters)
│   ├── paths.py                     (dev vs frozen path resolution)
│   └── requirements.txt             (runtime Python dependencies)
├── scripts/
│   ├── build-python.mjs             (PyInstaller build driver)
│   ├── populate-test-sessions.mjs   (test data generator)
│   └── setup_model.py               (downloads MediaPipe model)
├── src/
│   ├── domain/                    # Framework-agnostic business logic
│   ├── main/                      # Electron main process
│   │   ├── assets/                  (bundled audio files)
│   │   └── reminder-strategies/     (blink and 20-20-20 reminder implementations)
│   ├── renderer/                  # React UI
│   │   ├── components/
│   │   ├── hooks/
│   │   └── styles/
│   └── shared/                    # IPC protocol types
└── test/                          # Broadly mirrors src/, plus a python/ folder for Python tests
    ├── domain/
    ├── main/
    ├── python/
    └── renderer/
```
---

## Acknowledgements

- Blink detection built on [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) and [OpenCV](https://opencv.org/).
- Eye Aspect Ratio approach informed by the blink detection Literature Review.
- Desktop shell built on [Electron](https://electronjs.org/) with [Vite](https://vitejs.dev/) for the renderer build and [electron-builder](https://www.electron.build/) for packaging.
- UI styled with [Tailwind CSS](https://tailwindcss.com/).
