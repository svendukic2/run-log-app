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
  type Run,
} from '@/lib/runs';

const RECENT_RUNS_COUNT = 3;

// One row's layout, applied to whichever element carries it: a plain div on
// the dashboard, the Link itself on a profile (so the whole row is the
// target, not just the route name).
const ROW = 'flex items-center justify-between gap-6 py-[15px]';

interface RecentRunsCardProps {
  // Omitted on the dashboard (the signed-in user's own store); given on
  // someone else's public profile (RUN-63), whose runs arrive with the
  // profile and live in no store this browser owns.
  runs?: Run[];
  // Where a row leads. Omitted means nowhere: the dashboard's rows have
  // never been links. A profile passes personRunRoute, so a row opens that
  // run's READ-ONLY detail (AC4) - which is also why this is an href and
  // never an onClick that could grow an edit affordance.
  runHref?: (runId: string) => string;
  // The "View all" action. Explicitly null on a profile: there is no
  // "all runs" screen for another runner to open.
  viewAllHref?: string | null;
}

// The dashboard's "Recent runs" card (RUN-20, DSH-8): the three most recent
// runs with an effort dot, route name, "{date} · {duration} min" caption,
// distance and pace, plus a "View all" action into the full runs list. Runs
// arrive newest-first, so "most recent" is a plain slice; a newly saved run
// re-renders the card and pushes the oldest row off (AC3).
export default function RecentRunsCard({ runs, ...rest }: RecentRunsCardProps) {
  // Two components because hooks cannot be called conditionally, and
  // useRuns() outside an AppDataBoundary throws in development by design.
  return runs ? <RecentRuns runs={runs} {...rest} /> : <OwnRecentRuns {...rest} />;
}

function OwnRecentRuns(rest: Omit<RecentRunsCardProps, 'runs'>) {
  const runs = useRuns();
  return <RecentRuns runs={runs} {...rest} />;
}

function RecentRuns({
  runs,
  runHref,
  viewAllHref = ROUTES.runs,
}: RecentRunsCardProps & { runs: Run[] }) {
  const recent = runs.slice(0, RECENT_RUNS_COUNT);

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
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-[14px] font-semibold text-accent hover:text-accent-pressed"
          >
            View all
          </Link>
        )}
      </div>

      <ul className="mt-[6px]">
        {recent.map((run) => {
          const row = (
            <>
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
            </>
          );

          return (
            // The row's layout lives on the inner element, the whole of
            // which is the link target on a profile. Only the last row's
            // dropped bottom padding has to reach through from the li.
            <li key={run.id} className="border-b border-line last:border-b-0 last:[&>*]:pb-0">
              {runHref ? (
                <Link
                  href={runHref(run.id)}
                  className={`${ROW} hover:text-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
                >
                  {row}
                </Link>
              ) : (
                <div className={ROW}>{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
