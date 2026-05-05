import fs from 'node:fs'
import path from 'node:path'
import type { SessionSummary } from '../shared/ipc-messages'

// File name within the user data directory.
const SESSIONS_FILE = 'sessions.json'

/**
 * Persists session summaries to a JSON file in the user data directory.
 * The file is a single JSON array; new sessions are added by reading the
 * array, appending in memory, and rewriting the whole file. This is fine
 * given how small the data is (one entry per monitoring session).
 */
export class SessionLogger {
  private filePath: string

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, SESSIONS_FILE)
  }

  /**
   * Add a session summary to the log. Reads the existing array, pushes the
   * new entry, and rewrites the whole file.
   */
  append(summary: SessionSummary): void {
    const existing = this.getAll()
    existing.push(summary)
    fs.writeFileSync(this.filePath, JSON.stringify(existing, null, 2), 'utf-8')
  }

  /** Overwrite the log file with an empty array. */
  clear(): void {
    fs.writeFileSync(this.filePath, '[]', 'utf-8')
  }

  /**
   * Read all session summaries. Returns an empty array if the file is
   * missing, unreadable, or contains anything that isn't a JSON array.
   * Any error is ignored rather than thrown, so a corrupted log file
   * can't stop the rest of the app from loading.
   */
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