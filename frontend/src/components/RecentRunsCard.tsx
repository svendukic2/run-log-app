'use client';

import Link from 'next/link';
import { EFFORT_DOT } from '@/components/EffortField';
import { ROUTES } from '@/lib/routes';
import {
  formatDateShort,
  formatDistanceKm,
  formatDurationMinutes,
  formatPace,
  useRuns,
} from '@/lib/runs';

const RECENT_RUNS_COUNT = 3;

// The dashboard's "Recent runs" card (RUN-20, DSH-8): the three most recent
// runs with an effort dot, route name, "{date} · {duration} min" caption,
// distance and pace, plus a "View all" action into the full runs list. The
// store keeps runs newest-first, so "most recent" is a plain slice; a newly
// saved run re-renders the card and pushes the oldest row off (AC3).
export default function RecentRunsCard() {
  const recent = useRuns().slice(0, RECENT_RUNS_COUNT);

  return (
    <section
      aria-labelledby="recent-runs-title"
      className="rounded-[18px] border border-line bg-white px-[28px] py-[24px]"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="recent-runs-title"
          className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary"
        >
          Recent runs
        </h2>
        <Link
          href={ROUTES.runs}
          className="text-[14px] font-semibold text-accent hover:text-accent-pressed"
        >
          View all
        </Link>
      </div>

      <ul className="mt-[6px]">
        {recent.map((run) => (
          <li
            key={run.id}
            className="flex items-center justify-between gap-6 border-b border-line py-[15px] last:border-b-0 last:pb-0"
          >
            <div className="flex min-w-0 items-center gap-[13px]">
              {/* The dot is decorative; the sr-only text carries the effort
                  for anyone who cannot read it from the colour (AC4). The
                  effort value is validated on read, so the map lookup cannot
                  miss. */}
              <span
                aria-hidden="true"
                data-testid="effort-dot"
                className={`size-[9px] shrink-0 rounded-full ${EFFORT_DOT[run.effort]}`}
              />
              <span className="sr-only">{run.effort} effort</span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-text-primary">
                  {run.routeName}
                </p>
                <p className="text-[13px] text-tertiary">
                  {formatDateShort(run.date)} · {formatDurationMinutes(run.durationSeconds)}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[15px] font-semibold text-text-primary">
                {formatDistanceKm(run.distanceKm)}
              </p>
              <p className="text-[13px] text-tertiary">{formatPace(run)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
