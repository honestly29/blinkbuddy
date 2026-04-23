#!/usr/bin/env node

/**
 * Builds the Python service into a standalone executable using PyInstaller.
 *
 * Why we need this: our Python blink detector uses MediaPipe, OpenCV, and
 * NumPy. A user who installs BlinkBuddy shouldn't have to install Python
 * and run `pip install` themselves. PyInstaller packages the Python code
 * plus all its dependencies into a single folder that can just be run.
 *
 * This script runs five steps in order:
 *   1. Make sure we have a Python environment with the build tools installed.
 *   2. Make sure the face detection model is downloaded.
 *   3. Delete any leftover files from previous builds.
 *   4. Run PyInstaller to create the bundle.
 *   5. Check that the output actually exists and is runnable.
 */

// spawnSync runs a command and waits for it to finish before moving on.
// Each step has to succeed before the next one starts.
import { spawnSync } from 'node:child_process'

// Tools for checking if files exist, deleting folders, reading file sizes, and checking file permissions.
import { existsSync, rmSync, statSync, constants as fsConstants, accessSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const venvDir = path.join(projectRoot, '.venv-build')
const venvPython = path.join(venvDir, 'bin', 'python')
const venvPip = path.join(venvDir, 'bin', 'pip')
const venvPyinstaller = path.join(venvDir, 'bin', 'pyinstaller')
const requirementsFile = path.join(projectRoot, 'requirements-build.txt')
const modelFile = path.join(projectRoot, 'python', 'models', 'face_landmarker_v2.task')
const setupModelScript = path.join(projectRoot, 'scripts', 'setup_model.py')
const specFile = path.join(projectRoot, 'blinkbuddy-service.spec')
const distDir = path.join(projectRoot, 'python-dist')
const workDir = path.join(projectRoot, 'build')   // PyInstaller's temporary work folder
const outputBinary = path.join(distDir, 'blinkbuddy-service', 'blinkbuddy-service')


/**
 * Helper function that runs a command and handles errors for us.
 * Prints the command so you can see what's happening, shows the
 * command's output live in the terminal, and stops the whole 
 * script if the command fails. 
 */
function run(cmd, args, opts = {}) {
  const printable = `${cmd} ${args.join(' ')}`
  console.log(`> ${printable}`)
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',  // makes the command's output appears in our terminal as it happens
    cwd: projectRoot,
    ...opts,
  })
  // Exit code 0 means success, anything else means failure.
  if (result.status !== 0) {
    console.error(`[FAIL] Command failed (exit ${result.status}): ${printable}`)
    // Stop the whole script.
    process.exit(result.status ?? 1)
  }
}


/**
 * Step 1: Set up a Python environment with the tools PyInstaller needs.
 */
function ensureBuildVenv() {
  // Only create the venv if it doesn't already exist.
  if (!existsSync(venvPython)) {
    console.log('Creating .venv-build/ ...')
    run('python3', ['-m', 'venv', venvDir])
  }
  console.log('Installing build-time requirements ...')
  run(venvPip, ['install', '--upgrade', 'pip'])
  run(venvPip, ['install', '-r', requirementsFile])
}


/**
 * Step 2: Make sure the face detection model file is available.
 *
 * The MediaPipe .task file is ~3.6 MB and lives in python/models/. 
 * We don't commit it to git, so if it's missing we run the download script.
 */
function ensureModel() {
  if (existsSync(modelFile)) {
    // File's already here - nothing to do.
    return
  }
  console.log('FaceLandmarker model missing - running scripts/setup_model.py ...')
  // Call the download script
  run(venvPython, [setupModelScript])
}


/**
 * Step 3: Delete any leftover files from previous builds.
 *
 * PyInstaller doesn't always overwrite old files cleanly. 
 * Deleting the folders first guarantees a clean slate.
 */
function cleanArtefacts() {
  for (const dir of [distDir, workDir]) {
    if (existsSync(dir)) {
      console.log(`Removing ${dir} ...`)
      rmSync(dir, { recursive: true, force: true })
    }
  }
}


/**
 * Step 4: Run PyInstaller to produce the bundle.
 *
 * PyInstaller reads blinkbuddy-service.spec and produces 
 * the executable plus all its dependencies in
 * python-dist/blinkbuddy-service/.
 */
function runPyInstaller() {
  run(venvPyinstaller, [
    specFile,
    '--clean',      // wipes PyInstaller's own cache
    '--noconfirm',
    '--distpath', distDir,
    '--workpath', path.join(workDir, 'pyinstaller'),
  ])
}


/**
 * Step 5: Double-check the output actually exists and works.
 *
 * If something went wrong silently earlier, we want to fail
 * loudly here rather than wait until Electron tries to run
 * a broken or missing binary.
 */
function verifyOutput() {
  // Check 1: the binary file actually exists.
  if (!existsSync(outputBinary)) {
    console.error(`[FAIL] Expected binary not found: ${outputBinary}`)
    process.exit(1)
  }
  // Check 2: the binary has the executable permission bit set.
  // On macOS, a file needs this bit or you can't run it.
  try {
    accessSync(outputBinary, fsConstants.X_OK)
  } catch {
    console.error(`[FAIL] Binary is not executable: ${outputBinary}`)
    process.exit(1)
  }
  // Check 3: print the file size as a sanity check. 
  // A working build should be around 10 MB; if we see 
  // something tiny (e.g, 1 KB) the build probably failed somewhere
  const sizeMb = statSync(outputBinary).size / (1024 * 1024)
  console.log(`[OK] Built ${outputBinary} (${sizeMb.toFixed(1)} MB launcher)`)
}

// Run all five steps in order.
ensureBuildVenv()
ensureModel()
cleanArtefacts()
runPyInstaller()
verifyOutput()