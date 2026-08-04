'use client';

import { formatDateShort, formatDistanceKm, lastWeekStarts, totalsForWeek, useRuns } from '@/lib/runs';
import { useToday } from '@/lib/useToday';

const WEEK_COUNT = 8;

// One decimal, once: heights, the max and the announced values all derive
// from this same rounded number, so a 0.04 km week can never draw a tall bar
// while announcing "0.0 km".
function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

// The "Distance" card (RUN-19, DSH-7): weekly distance over the last 8
// Mon-Sun weeks as a bar chart, with the current week highlighted. Display
// only, no designed interactions, so nothing in here is clickable and there
// are no hover states. Bars derive from the runs store, so a run saved into a
// past week moves that week's bar, not the current one.
export default function DistanceChartCard() {
  const runs = useRuns();
  const today = useToday();

  const weeks = lastWeekStarts(today, WEEK_COUNT).map((weekStart) => ({
    weekStart,
    distanceKm: roundKm(totalsForWeek(runs, weekStart).distanceKm),
  }));
  const maxKm = Math.max(...weeks.map((week) => week.distanceKm));

  return (
    <section
      aria-labelledby="distance-chart-title"
      className="rounded-[18px] border border-line bg-white px-[28px] py-[26px]"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="distance-chart-title"
          className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary"
        >
          Distance
        </h2>
        <span className="text-[13px] text-tertiary">{`Last ${WEEK_COUNT} weeks`}</span>
      </div>

      <ul className="mt-[24px] flex items-end gap-[10px] sm:gap-[16px]">
        {weeks.map(({ weekStart, distanceKm }, index) => {
          // lastWeekStarts ends with the week `today` falls in by construction.
          const current = index === WEEK_COUNT - 1;
          // Zero draws zero: a week without runs shows no bar rather than the
          // same sliver as a genuinely short week. The current week alone
          // keeps a minimal accent baseline so its highlight survives an
          // empty week (AC2).
          const heightPercent = maxKm > 0 ? (distanceKm / maxKm) * 100 : 0;
          return (
            <li key={weekStart} className="flex min-w-0 flex-1 flex-col gap-[12px]">
              <div className="flex h-[120px] items-end">
                <div
                  data-testid="distance-bar"
                  data-current={current || undefined}
                  className={`w-full rounded-[8px] ${
                    current ? 'min-h-[4px] bg-accent' : 'bg-accent-soft'
                  }`}
                  style={{ height: `${heightPercent}%` }}
                />
              </div>
              {/* Below `sm` eight labels cannot fit, so only every other one
                  shows rather than truncating them all into "May…". Odd
                  indexes include the current week's label. The sr-only line
                  announces every week regardless. */}
              <span
                aria-hidden="true"
                className={`text-center text-[11.5px] whitespace-nowrap ${
                  current ? 'font-semibold text-accent' : 'text-tertiary'
                } ${index % 2 === 1 ? '' : 'hidden sm:block'}`}
              >
                {formatDateShort(weekStart)}
              </span>
              <span className="sr-only">
                {`Week of ${formatDateShort(weekStart)}${current ? ', current week' : ''}: ${formatDistanceKm(distanceKm)}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
