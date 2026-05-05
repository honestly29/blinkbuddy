/**
 * Spawns the Python blink-detection service as a child process and
 * provides a typed interface for sending it commands and receiving
 * blink/tracking events back.
 *
 * Communication is over the child's stdin (commands going to Python)
 * and stdout (events coming back). Each message is a single JSON
 * object on its own line, separated by newlines.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { createInterface, type Interface } from 'node:readline'
import { EventEmitter } from 'node:events'
import type { PythonCommand, PythonEvent } from '../shared/protocol'

export interface PythonBridgeEvents {
  event: [PythonEvent]
  error: [Error]
  exit: [code: number | null, signal: string | null]
}

export interface PythonBridgeOptions {
  isPackaged: boolean
  resourcesPath: string  // Used in packaged mode
  projectRoot: string    // Used in dev mode
}

export class PythonBridge extends EventEmitter<PythonBridgeEvents> {
  private process: ChildProcess | null = null
  private readline: Interface | null = null
  private options: PythonBridgeOptions

  constructor(options: PythonBridgeOptions) {
    super()
    this.options = options
  }

  /**
   * Spawn the Python child process.
   * Safe to call multiple times - will no-op if already running.
   */
  spawn(): void {
    if (this.process) return

    if (this.options.isPackaged) {
      // Packaged mode: spawn the standalone binary we built with PyInstaller
      const binary = path.join(this.options.resourcesPath, 'python-service', 'blinkbuddy-service')
      this.process = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    } else {
      // Dev mode: run the Python source directly using our .venv.
      const py = path.join(this.options.projectRoot, '.venv', 'bin', 'python')
      this.process = spawn(py, ['-m', 'python.main'], {
        cwd: this.options.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    }

    // Parse stdout as JSON Lines
    this.readline = createInterface({ input: this.process.stdout! })
    this.readline.on('line', (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) return

      try {
        const message = JSON.parse(trimmed) as PythonEvent
        this.emit('event', message)
      } catch {
        console.error('[PythonBridge] Failed to parse JSON line:', trimmed)
      }
    })

    // Log stderr for diagnostics
    this.process.stderr!.on('data', (chunk: Buffer) => {
      console.error('[Python stderr]', chunk.toString().trimEnd())
    })

    this.process.on('error', (err: Error) => {
      console.error('[PythonBridge] Process error:', err.message)
      this.emit('error', err)
    })

    this.process.on('exit', (code, signal) => {
      console.log(`[PythonBridge] Process exited (code=${code}, signal=${signal})`)
      this.cleanup()
      this.emit('exit', code, signal)
    })
  }

  /**
   * Send a command to the Python process via stdin.
   */
  send(command: PythonCommand): void {
    if (!this.process?.stdin?.writable) {
      console.error('[PythonBridge] Cannot send - process not running')
      return
    }
    const line = JSON.stringify(command) + '\n'
    this.process.stdin.write(line)
  }

  /**
   * Gracefully stop the Python process:
   * 1. Close stdin (causes Python's readline loop to exit cleanly).
   * 2. Wait up to 3 seconds for the process to exit on its own.
   * 3. If it hasn't exited by then, send SIGTERM to force it.
   */
  async kill(): Promise<void> {
    if (!this.process) return
    const proc = this.process

    // Close stdin to trigger Python's clean shutdown 
    proc.stdin?.end()

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // 3s gives Python time to release the camera and emit any final
        // events. After that, force-kill rather than hang on shutdown.
        if (proc.exitCode === null) {
          console.log('[PythonBridge] Force-killing Python process')
          proc.kill('SIGTERM')
        }
        resolve()
      }, 3000)

      proc.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })

    this.cleanup()
  }

  /**
   * Synchronous kill for Electron's quit handlers, where async work isn't
   * allowed. Skips the graceful shutdown that kill() does and goes
   * straight to SIGTERM, since there's no time to wait during quit.
   */
  killSync(): void {
    if (!this.process) return
    try {
      this.process.kill('SIGTERM')
    } catch {
      // Process may already be dead
    }
    this.cleanup()
  }

  private cleanup(): void {
    this.readline?.close()
    this.readline = null
    this.process = null
  }
}