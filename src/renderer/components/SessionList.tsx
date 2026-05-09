import type { SessionSummary } from '../../shared/ipc-messages'
import { HEALTHY_BLINK_RATE } from '../../domain/session-history'
import {
  formatDuration,
  formatSessionTime,
  groupSessionsByDay,
  type SessionGroup,
} from './session-stats'



/**
 * Coloured badge showing a blink rate value (e.g. "12.3/min").
 *
 * Green when the rate meets HEALTHY_BLINK_RATE, amber otherwise. Used in
 * each session row to give a signal of how healthy that session's
 * average blink rate was.
 */
function BlinkRateBadge({ rate }: { rate: number }) {
  const healthy = rate >= HEALTHY_BLINK_RATE
  const colour = healthy
    ? 'bg-green-500/20 text-green-400'
    : 'bg-amber-500/20 text-amber-400'

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colour}`}>
      {rate.toFixed(1)}/min
    </span>
  )
}


/**
 * One row in the session list: a single session's summary.
 *
 * Top line shows the start time on the left and the blink-rate badge on
 * the right. Bottom line shows duration, total blinks, and reminder
 * count, separated by middle dots. 
 */
function SessionRow({ session }: { session: SessionSummary }) {
  return (
    <div className="rounded-lg bg-gray-800 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">
          {formatSessionTime(session.sessionStart)}
        </span>
        <BlinkRateBadge rate={session.avgBlinksPerMinute} />
      </div>
      <div className="mt-1 text-xs text-gray-400">
        {formatDuration(session.totalDurationSeconds)} &middot;{' '}
        {session.totalBlinks} blinks &middot;{' '}
        {session.remindersTriggered} {session.remindersTriggered === 1 ? 'reminder' : 'reminders'}
      </div>
    </div>
  )
}


/**
 * Renders a list of date-grouped sessions as date headers ("Today",
 * "Yesterday", "15 January") with each day's session rows beneath.
 *
 * Used twice in SessionList: once for recent (last 7 days) sessions,
 * which always render, and once for older sessions, which render only
 * when the user has expanded the list.
 */
function SessionGroupList({ groups }: { groups: SessionGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.header}>
          <h3 className="mb-1.5 mt-3 text-xs font-medium text-gray-500 first:mt-0">
            {group.header}
          </h3>
          <div className="space-y-2">
            {group.sessions.map((s, i) => (
              <SessionRow key={i} session={s} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}


/**
 * Date-grouped session list with a "show older sessions" expand toggle.
 *
 * The list is split at a 7-day cutoff: sessions from the last 7 days
 * are always shown; older ones are hidden behind a button. This prevents
 * the default window from becoming too long while still giving access
 * to the full history.
 *
 * The expand/collapse state lives in the parent (StatsPage) and is
 * passed in as `showAll` and `onToggle`.
 *
 * @param sessions - All sessions, in any order; this component handles
 *   the filtering and grouping.
 * @param showAll - Whether older sessions are currently expanded.
 * @param onToggle - Called when the user clicks the toggle button.
 */
export function SessionList({
  sessions,
  showAll,
  onToggle,
}: {
  sessions: SessionSummary[]
  showAll: boolean
  onToggle: () => void
}) {

  // The cutoff is the start of the day 7 days ago (midnight, local time).
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 7)
  // Setting hours to 0:00:00.000 means a session from any time on day -7
  // still appears in the 'last 7 days' section, regardless of when the
  // user opened the page.
  cutoffDate.setHours(0, 0, 0, 0)

  // Split the input into two groups: anything on or after the cutoff is
  // "recent" (always shown); anything before is "older" (toggleable).
  const recentSessions = sessions.filter((s) => new Date(s.sessionStart) >= cutoffDate)
  const olderSessions = sessions.filter((s) => new Date(s.sessionStart) < cutoffDate)
  const recentGroups = groupSessionsByDay(recentSessions)
  const olderGroups = groupSessionsByDay(olderSessions)

  return (
    <div className="space-y-1">
      <SessionGroupList groups={recentGroups} />
      {/* Only render the toggle button if there are older sessions to
          show. */}
      {olderGroups.length > 0 && (
        <button
          onClick={onToggle}
          className="mt-3 w-full rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
        >
          {showAll ? 'Show less' : 'Show older sessions'}
        </button>
      )}
      {showAll && <SessionGroupList groups={olderGroups} />}
    </div>
  )
}