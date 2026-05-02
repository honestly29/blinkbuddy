import type { SessionSummary } from '../../shared/ipc-messages'
import { computeDailyRates, formatTotalTime, HEALTHY_BLINK_RATE } from './session-stats'


/**
 * Bar chart of average blink rate per day for the most recent 8 days.
 *
 * Each bar represents one day's time-weighted average blink rate
 * (computed by computeDailyRates). Bars are coloured green when the
 * rate is at or above HEALTHY_BLINK_RATE and amber otherwise, with a
 * dashed reference line drawn across the chart at the healthy threshold.
 *
 * The chart is drawn as inline SVG rather than using a library.
 * The dataset is small (8 bars max) and the design is fixed, so a simple
 * drawn SVG is simpler than pulling in a dependency.
 *
 * Renders nothing if there are no days with sessions yet.
 */
export function BlinkRateChart({ sessions }: { sessions: SessionSummary[] }) {
  const days = computeDailyRates(sessions)
  if (days.length === 0) return null

  // SVG canvas dimensions and padding around the chart area.
  const svgWidth = 400
  const svgHeight = 200
  const padLeft = 26
  const padRight = 5
  const padTop = 22
  const padBottom = 18
  const chartWidth = svgWidth - padLeft - padRight
  const chartHeight = svgHeight - padTop - padBottom

  // The y-axis goes from 0 up to the smallest multiple of 10 that fits
  // every bar. 
  // Math.max(..., 20) ensures the axis is at least 0-20 even when
  // the data is low, so the chart never collapses and the "Healthy"
  // reference stays visible.
  const maxRate = Math.max(...days.map((d) => d.rate), 20)
  const ceilMax = Math.ceil(maxRate / 10) * 10

  // Y-coordinate of the dashed "Healthy" reference line.
  const refY = padTop + chartHeight - (HEALTHY_BLINK_RATE / ceilMax) * chartHeight

  // Bar layout: each bar is barWidth wide with barGap between bars. We
  // compute the total group width and then offset it so the whole group
  // is horizontally centred within the chart area.
  const barWidth = 28
  const barGap = 14
  const groupWidth = days.length * barWidth + (days.length - 1) * barGap
  const offsetX = padLeft + (chartWidth - groupWidth) / 2

  // Y-axis tick values: 0, 10, 20, ... up to ceilMax. Drawn as small
  // tick marks with numeric labels next to them.
  const ticks: number[] = []
  for (let v = 0; v <= ceilMax; v += 10) ticks.push(v)

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Blink Rate Trend
      </h2>
      <div className="rounded-lg bg-gray-800 p-4">
        {/* width="100%" + viewBox makes the SVG scale to fit the container
            while keeping its internal coordinate system fixed. */}
        <svg
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label="Blink rate trend bar chart"
        >
          {/* Y-axis ticks and labels */}
          {ticks.map((v) => {
            const y = padTop + chartHeight - (v / ceilMax) * chartHeight
            return (
              <g key={`tick-${v}`}>
                <line
                  x1={padLeft - 4}
                  y1={y}
                  x2={padLeft}
                  y2={y}
                  stroke="#6b7280"
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="#6b7280"
                  fontSize={8}
                >
                  {v}
                </text>
              </g>
            )
          })}

          {/* Y-axis line */}
          <line
            x1={padLeft}
            y1={padTop}
            x2={padLeft}
            y2={padTop + chartHeight}
            stroke="#374151"
            strokeWidth={1}
          />

          {/* X-axis baseline */}
          <line
            x1={padLeft}
            y1={padTop + chartHeight}
            x2={svgWidth - padRight}
            y2={padTop + chartHeight}
            stroke="#374151"
            strokeWidth={1}
          />

          {/* Dashed reference line at the healthy blink rate threshold */}
          <line
            x1={padLeft}
            y1={refY}
            x2={svgWidth - padRight}
            y2={refY}
            stroke="rgba(74, 222, 128, 0.3)"
            strokeDasharray="6 4"
            strokeWidth={1}
          />
          <text
            x={padLeft}
            y={refY + 3.5}
            textAnchor="end"
            fill="#4ade80"
            fontSize={7}
            opacity={0.6}
          >
            Healthy
          </text>

          {/* One vertical bar per day, plus three text labels:
              the rate value above the bar, the date below the chart,
              and the day's monitoring duration below the date. */}
          {days.map((d, i) => {
            const healthy = d.rate >= HEALTHY_BLINK_RATE
            // Green when the day met the healthy threshold, amber otherwise.
            const fill = healthy
              ? 'rgba(34, 197, 94, 0.75)'
              : 'rgba(217, 158, 20, 0.75)'

            // Bar height is proportional to the rate.
            const barHeight = (d.rate / ceilMax) * chartHeight
            const x = offsetX + i * (barWidth + barGap)
            const y = padTop + chartHeight - barHeight

            return (
              <g key={d.date}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={3}
                  fill={fill}
                />
                {/* Numeric blink rate, drawn just above the bar. */}
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fill="#e5e7eb"
                  fontSize={7}
                  fontWeight={500}
                >
                  {d.rate.toFixed(1)}
                </text>
                {/* Date label below the chart (e.g. "2 May"). */}
                <text
                  x={x + barWidth / 2}
                  y={svgHeight - 8}
                  textAnchor="middle"
                  fill="#9ca3af"
                  fontSize={7}
                >
                  {d.label}
                </text>
                {/* Total monitoring time for the day, below the date. */}
                <text
                  x={x + barWidth / 2}
                  y={svgHeight}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize={7}
                >
                  {formatTotalTime(d.totalDuration)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}