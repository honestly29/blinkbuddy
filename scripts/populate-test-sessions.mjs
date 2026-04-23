/**
 * Populate BlinkBuddy's sessions.json with realistic fake sessions for development.
 *
 * Usage:
 *   node scripts/populate-test-sessions.mjs
 *   node scripts/populate-test-sessions.mjs --count=30 --seed=42
 *   node scripts/populate-test-sessions.mjs --out=/tmp/blinkbuddy-fixture
 *
 * Writes to the platform-appropriate Electron userData dir for the "blinkbuddy" app by default. 
 * Overwrites the existing sessions.json.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP_NAME = 'blinkbuddy'

// ---------- args ----------

function parseArgs(argv) {
  const args = {}
  for (const raw of argv.slice(2)) {
    const match = raw.match(/^--([^=]+)=(.*)$/)
    if (match) args[match[1]] = match[2]
  }
  return args
}

const args = parseArgs(process.argv)
// clamp guards against bad inputs like --count=0 or --count=999999
const count = clamp(parseInt(args.count ?? '25', 10), 1, 500)
const seed = parseInt(args.seed ?? '20260417', 10)


// ---------- path resolution  ----------

/**
 * Recreate Electron's userData path convention. The script
 * runs under plain Node, not inside Electron, so it can't import `app`
 * and call getPath('userData'). 
 */
function userDataDir() {
  if (args.out) return args.out
  const home = os.homedir()
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', APP_NAME)
    case 'win32':
      // APPDATA is the documented location
      return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), APP_NAME)
    default:
      return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), APP_NAME)
  }
}

// ---------- seeded PRNG (mulberry32) ----------

/**
 * mulberry32 is a small, fast, 32-bit PRNG. Deterministic given the
 * same seed so running this script twice with the default seed
 * produces identical data.
 */
function makeRng(initialSeed) {
  // >>> 0 forces the seed into an unsigned 32-bit integer, which is
  // what the algorithm assumes.
  let state = initialSeed >>> 0
  return function rand() {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    // Math.imul does 32-bit integer multiplication
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    // Divide by 2^32 to get a float in [0, 1) - same range as Math.random.
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = makeRng(seed)

// Returns a random number between min and max.
function randBetween(min, max) {
  return min + rand() * (max - min)
}

function randInt(min, max) {
  // max + 1 because Math.floor drops the fractional part 
  return Math.floor(randBetween(min, max + 1))
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// ---------- session generator ----------

const NOW = Date.now()
const WINDOW_DAYS = 21   // 21 days
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000

/**
 * Pick a session start time: anywhere in the last 21 days,
 * but with the hour-of-day constrained to waking hours.
 */
function pickSessionStartMs() {
  const millisInWindow = Math.floor(rand() * WINDOW_MS)
  const rawStart = NOW - millisInWindow
  const d = new Date(rawStart)
  // Override the time component with a random waking hour so sessions
  // cluster during typical computer use, not overnight.
  const hour = randInt(9, 20)
  const minute = randInt(0, 59)
  const second = randInt(0, 59)
  d.setHours(hour, minute, second, 0)
  return d.getTime()
}

/**
 * Generate a single SessionSummary with correlated realistic fields.
 */
function generateSession() {
  // Duration 2min to 30min 
  const durationSeconds = randInt(120, 1800)
  // Target blink rate: the simulated user's natural rate for this session.
  const targetBpm = randBetween(8, 25)
  // Derive totalBlinks from the target rate so the two fields agree.
  const totalBlinks = Math.round(targetBpm * (durationSeconds / 60))
  // Recompute avgBlinksPerMinute 
  const avgBlinksPerMinute = round2(totalBlinks / (durationSeconds / 60))

  // ~40% of sessions produce reminders 
  const remindersTriggered = rand() < 0.4 ? randInt(1, 5) : 0

  // ~70% had the 20-20-20 timer enabled. 
  const possibleBreaks = Math.floor(durationSeconds / 1200)   // how many 20-minute cycles fit in the session duration.
  const twentyTwentyBreaksTaken = rand() < 0.7 ? possibleBreaks : 0

  // Longest gap rises as blink rate falls 
  const gapFloor = 3 + (25 - targetBpm) * 0.4
  const longestGapBetweenBlinks = round2(randBetween(gapFloor, gapFloor + 15))

  // Stored in milliseconds - the CSV export divides by 1000. 
  const blinkRateStdDev = Math.round(randBetween(300, 4000))

  const startMs = pickSessionStartMs()
  const endMs = startMs + durationSeconds * 1000

  return {
    sessionStart: new Date(startMs).toISOString(),
    sessionEnd: new Date(endMs).toISOString(),
    totalBlinks,
    avgBlinksPerMinute,
    remindersTriggered,
    totalDurationSeconds: durationSeconds,
    twentyTwentyBreaksTaken,
    longestGapBetweenBlinks,
    blinkRateStdDev,
  }
}

// ---------- main ----------

// Sort chronologically before writing 
const sessions = Array.from({ length: count }, generateSession).sort((a, b) =>
  a.sessionStart.localeCompare(b.sessionStart),
)

const targetDir = userDataDir()
const targetFile = path.join(targetDir, 'sessions.json')

// creates the directory tree if missing, no-op if it already exists.
fs.mkdirSync(targetDir, { recursive: true })
fs.writeFileSync(targetFile, JSON.stringify(sessions, null, 2), 'utf-8')


console.log(`Wrote ${sessions.length} fake sessions to ${targetFile}`)
console.log(`  seed=${seed} window=last ${WINDOW_DAYS} days`)
console.log(`  range: ${sessions[0].sessionStart} → ${sessions[sessions.length - 1].sessionStart}`)