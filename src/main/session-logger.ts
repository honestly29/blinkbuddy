import fs from 'node:fs'
import path from 'node:path'
import type { SessionSummary } from '../shared/ipc-messages'

const SESSIONS_FILE = 'sessions.json'

export class SessionLogger {
  private filePath: string

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, SESSIONS_FILE)
  }

  /** Append a session summary to the log file. */
  append(summary: SessionSummary): void {
    const existing = this.getAll()
    existing.push(summary)
    fs.writeFileSync(this.filePath, JSON.stringify(existing, null, 2), 'utf-8')
  }

  /** Overwrite the log file with an empty array. */
  clear(): void {
    fs.writeFileSync(this.filePath, '[]', 'utf-8')
  }

  /** Read all session summaries. Returns [] if file missing/corrupt. */
  getAll(): SessionSummary[] {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
    
      if (!Array.isArray(parsed)) return []
      return parsed
    } catch {
      // Covers both "file doesn't exist" and "file is malformed JSON".
      return []
    }
  }
}