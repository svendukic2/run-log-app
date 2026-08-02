'use client';

import { EFFORT_DOT } from '@/components/EffortField';
import { formatDate, formatDuration, formatPace, useRuns } from '@/lib/runs';

interface RunListProps {
  title: string;
  emptyMessage: string;
  // Dashboard shows a handful; the Runs page shows the lot.
  limit?: number;
}

// Provisional readout of the stored runs, so a run saved in the modal is
// visible on the page underneath it straight away (RUN-23 AC2). The designed
// surfaces replace it: the recent-runs card with RUN-20 and the sortable,
// filterable table with RUN-24.
export default function RunList({ title, emptyMessage, limit }: RunListProps) {
  const runs = useRuns();
  const visible = limit ? runs.slice(0, limit) : runs;

  return (
    <section data-testid="run-list" className="flex flex-col gap-3">
      <h2 className="text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase">{title}</h2>

      {visible.length === 0 ? (
        <p className="text-[14.5px] text-secondary">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-white">
          {visible.map((run) => (
            <li
              key={run.id}
              className="flex flex-col gap-1 border-b border-line px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`size-[9px] shrink-0 rounded-full ${EFFORT_DOT[run.effort]}`}
                />
                <span className="truncate text-[14.5px] font-medium text-text-primary">
                  {run.routeName}
                </span>
              </div>
              {/* Wraps onto its own line on a phone rather than squeezing the
                  route name out of the row. */}
              <p className="shrink-0 pl-6 text-[13px] text-secondary sm:pl-0 sm:text-[14px]">
                {formatDate(run.date)} · {run.distanceKm.toFixed(1)} km ·{' '}
                {formatDuration(run.durationSeconds)} · {formatPace(run)} · {run.effort}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
