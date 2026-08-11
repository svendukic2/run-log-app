'use client';

import {
  distanceForDay,
  formatDateShort,
  formatDistanceKm,
  lastDays,
  roundKm,
  useRuns,
  type Run,
} from '@/lib/runs';
import { useToday } from '@/lib/useToday';

const DAY_COUNT = 14;

// The "Distance" card (RUN-19, redesigned): distance per day over the last 14
// days as a bar chart, with today highlighted. No labels under the bars; each
// bar's date and distance appear in a tooltip on hover instead. Bars derive
// from the runs it is given, so a run saved on a past day moves that day's
// bar, not today's.
//
// `runs` omitted means the signed-in user's own store (the dashboard);
// given means someone else's public profile (RUN-63), which has no store
// and no AppDataBoundary to read one through. Split into two components
// because hooks cannot be called conditionally.
export default function DistanceChartCard({ runs }: { runs?: Run[] }) {
  return runs ? <Chart runs={runs} /> : <OwnChart />;
}

function OwnChart() {
  const runs = useRuns();
  return <Chart runs={runs} />;
}

function Chart({ runs }: { runs: Run[] }) {
  const today = useToday();

  const days = lastDays(today, DAY_COUNT).map((date) => ({
    date,
    distanceKm: roundKm(distanceForDay(runs, date)),
  }));
  const maxKm = Math.max(...days.map((day) => day.distanceKm));

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
        <span className="text-[13px] text-tertiary">{`Last ${DAY_COUNT} days`}</span>
      </div>

      {/* The tooltip escapes the 120px bar area upwards, so the list keeps
          headroom above the tallest bar instead of clipping it. */}
      <ul className="mt-[16px] flex items-end gap-[6px] pt-[36px] sm:gap-[8px]">
        {days.map(({ date, distanceKm }, index) => {
          // lastDays ends on `today` by construction.
          const current = index === DAY_COUNT - 1;
          // Zero draws zero: a day without runs shows no bar rather than the
          // same sliver as a genuinely short run. Today alone keeps a minimal
          // accent baseline so its highlight survives an empty day.
          const heightPercent = maxKm > 0 ? (distanceKm / maxKm) * 100 : 0;
          return (
            <li key={date} className="group relative flex min-w-0 flex-1 flex-col">
              <div className="flex h-[120px] items-end">
                <div
                  data-testid="distance-bar"
                  data-current={current || undefined}
                  className={`w-full rounded-[6px] ${
                    current ? 'min-h-[4px] bg-accent' : 'bg-accent-soft group-hover:bg-accent'
                  }`}
                  style={{ height: `${heightPercent}%` }}
                />
              </div>
              {/* The date deliberately does not sit under the bar: fourteen
                  labels cannot fit, so it lives in this hover tooltip
                  instead. Pointer-only by design; the sr-only line below
                  announces every day regardless. */}
              <span
                role="tooltip"
                data-testid="distance-tooltip"
                className="pointer-events-none absolute -top-[34px] left-1/2 z-10 hidden -translate-x-1/2 rounded-[8px] bg-ink px-[10px] py-[6px] text-[11.5px] whitespace-nowrap text-white group-hover:block"
              >
                {`${formatDateShort(date)} · ${formatDistanceKm(distanceKm)}`}
              </span>
              <span className="sr-only">
                {`${formatDateShort(date)}${current ? ', today' : ''}: ${formatDistanceKm(distanceKm)}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
