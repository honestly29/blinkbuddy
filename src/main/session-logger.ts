import fs from 'node:fs'
import path from 'node:path'
import type { SessionSummary } from '../shared/ipc-messages'

// Filename within Electron's userData directory (alongside settings.json)
const SESSIONS_FILE = 'sessions.json'

/**
 * Reads and writes session summaries to a JSON array file on disk.
 *
 * Follows the same pattern as SettingsStore for consistency and testability 
 *
 * However, this class does not validate individual fields because 
 * session summaries are only written by the application itself
 * (not user-editable), so corruption implies unrecoverable data loss.
 */
export class SessionLogger {
  private filePath: string

  constructor(userDataPath: string) {
    // Build the full path, e.g. "~/Library/Application Support/BlinkBuddy/sessions.json"
    this.filePath = path.join(userDataPath, SESSIONS_FILE)
  }

  /** Append a session summary to the log file. */
  append(summary: SessionSummary): void {
    const existing = this.getAll()  // Returns [] if file missing/corrupt
    existing.push(summary)
    fs.writeFileSync(this.filePath, JSON.stringify(existing, null, 2), 'utf-8')
  }

  /** Read all session summaries. Returns [] if file missing/corrupt.
   * 
   *  Three failure modes handled:
   *    1. File doesn't exist (first run) -> readFileSync throws -> catch returns []
   *    2. File has invalid JSON (corruption) -> JSON.parse throws -> catch returns []
   *    3. File has valid JSON but not an array -> !Array.isArray check returns [] */
  getAll(): SessionSummary[] {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
    } catch {
      return []
    }
  }
}