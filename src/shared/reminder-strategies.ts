/**
 * Central registry of reminder strategy IDs used across the app.
 *
 * Why this file exists:
 * The same six strings ("audio-cue", "screen-edge-glow", etc.) used to be
 * repeated across the strategy classes, the IPC handlers, the renderer
 * components, and the tests. A typo in any one of those places (e.g.
 * "overaly") would compile cleanly and only fail at runtime when the
 * code path that used the wrong string actually ran.
 *
 * Centralising the IDs here means TypeScript treats them as a closed
 * set: the only valid values are the six in REMINDER_STRATEGY_IDS
 * below. Anywhere a strategy ID is used (a class field, a function
 * parameter, a React prop), it gets typed as ReminderStrategyId, and a
 * typo is rejected at compile time rather than at runtime.
 *
 * Adding a new strategy:
 *   1. Append the new ID to REMINDER_STRATEGY_IDS below.
 *   2. Write the strategy class.
 *   3. Run `npx tsc --noEmit`. TypeScript will list every site that
 *      still needs updating (factory map, applyStrategyPreference
 *      calls, JSX props, etc.). Work through the list until it's clean.
 */

export const REMINDER_STRATEGY_IDS = [
  'overlay',
  'screen-edge-glow',
  'corner-popup',
  'audio-cue',
  'twenty-twenty-popup',
  'twenty-twenty-audio',
] as const


// A type that matches exactly one of the strings above. Use this
// anywhere a value should be a strategy ID.
export type ReminderStrategyId = typeof REMINDER_STRATEGY_IDS[number]


/**
 * The four strategies owned by the blink reminder dispatcher
 * (overlay, screen edge glow, corner popup, audio cue). The two
 * 20-20-20 break strategies are not in this list because they are
 * created in src/main/index.ts and run by a different dispatcher.
 *
 * The factory map in ipc-handlers.ts uses this list as its
 * key type, because that handler only ever creates these four
 * strategies (the test buttons in settings only cover these four).
 * A compile error is raised if a new blink ID is added to the array 
 * without a matching factory entry.
 */
export const BLINK_REMINDER_STRATEGY_IDS = [
  'overlay',
  'screen-edge-glow',
  'corner-popup',
  'audio-cue',
] as const

// Same pattern as ReminderStrategyId above, but matches only the four
// blink IDs. Use this where a value should never be a 20-20-20 ID.
export type BlinkReminderStrategyId = typeof BLINK_REMINDER_STRATEGY_IDS[number]


/**
 * Returns true if `value` is one of the six known strategy IDs.
 *
 * Used at IPC boundaries (where messages cross between processes,
 * e.g. from the renderer to the main process). The receiving side
 * gets a plain string and can't trust the sender's TypeScript
 * checks, so it has to verify the value itself.
 *
 * The `value is ReminderStrategyId` return type tells TypeScript that
 * if this function returns true, the caller can treat `value` as a
 * ReminderStrategyId from that point forward (instead of an arbitrary
 * string). (type predicate)
 */
export function isReminderStrategyId(value: unknown): value is ReminderStrategyId {
  // The cast widens the array's element type so `.includes` accepts
  // any string. Runtime behaviour unchanged.
  return typeof value === 'string' && (REMINDER_STRATEGY_IDS as readonly string[]).includes(value)
}