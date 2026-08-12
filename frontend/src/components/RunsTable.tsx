'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EFFORT_DOT } from '@/components/EffortField';
import RunRowMenu from '@/components/RunRowMenu';
import { ROUTES } from '@/lib/routes';
import {
  EFFORT_CHIP,
  formatDate,
  formatDuration,
  formatPace,
  type Effort,
  type Run,
} from '@/lib/runs';

// Run detail is its own screen (09), built with RUN-27; until it lands this
// path 404s, which is the agreed seam between the two tickets.
function runDetailHref(run: Pick<Run, 'id'>): string {
  return `${ROUTES.runs}/${run.id}`;
}

const COLUMNS = ['Route', 'Date', 'Distance', 'Duration', 'Pace', 'Effort'];

function EffortChip({ effort }: { effort: Effort }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-[12px] py-[5px] text-[12.5px] font-semibold ${EFFORT_CHIP[effort]}`}
    >
      {effort}
    </span>
  );
}

function EffortDot({ effort }: { effort: Effort }) {
  return (
    <span aria-hidden="true" className={`size-[9px] shrink-0 rounded-full ${EFFORT_DOT[effort]}`} />
  );
}

interface RunsTableProps {
  runs: Run[];
}

// The runs table from 07 · Runs (RUN-24). Two renderings of the same rows:
// the full six-column table from `md` up, and stacked cards below it, where
// seven columns cannot fit a phone (responsive addendum, agreed in-project).
//
// Row clicks navigate to Run detail (AC6). The route name is a real link, so
// keyboard and screen-reader users get the same journey without a fake
// interactive row; the row's onClick is the pointer convenience on top.
export default function RunsTable({ runs }: RunsTableProps) {
  const router = useRouter();
  const openDetail = (run: Run) => router.push(runDetailHref(run));

  return (
    <>
      {/* Capped at roughly the ten rows the design shows, so longer histories
          scroll vertically inside the card with no pagination (AC7, A8). The
          header stays put while the rows scroll under it. */}
      {/* overflow-x-auto is explicit rather than inherited: setting only
          overflow-y makes CSS compute overflow-x to `auto` as a side effect,
          which is what kept the six columns scrollable at 768px, where the
          sidebar is still a drawer and the table has the full viewport but
          not much more than it needs. Saying it out loud is what AC2 asks
          for, and it changes no rendering at any width (RUN-75). */}
      <div className="hidden max-h-[576px] overflow-x-auto overflow-y-auto rounded-[18px] border border-line bg-white md:block">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="sticky top-0 z-10 border-b border-line bg-muted px-4 py-[13px] text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase first:pl-5"
                >
                  {column}
                </th>
              ))}
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-line bg-muted px-4 py-[13px]"
              >
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                data-testid="run-row"
                onClick={() => openDetail(run)}
                className="group cursor-pointer hover:bg-canvas/70"
              >
                <td className="border-b border-line-subtle py-[15px] pr-4 pl-5 group-last:border-b-0">
                  <span className="flex min-w-0 items-center gap-3">
                    <EffortDot effort={run.effort} />
                    <Link
                      href={runDetailHref(run)}
                      onClick={(event) => event.stopPropagation()}
                      className="truncate text-[14.5px] font-medium text-text-primary"
                    >
                      {run.routeName}
                    </Link>
                  </span>
                </td>
                <td className="border-b border-line-subtle px-4 py-[15px] text-[14px] whitespace-nowrap text-secondary group-last:border-b-0">
                  {formatDate(run.date)}
                </td>
                <td className="border-b border-line-subtle px-4 py-[15px] text-[14px] font-semibold whitespace-nowrap text-text-primary group-last:border-b-0">
                  {run.distanceKm.toFixed(1)} km
                </td>
                <td className="border-b border-line-subtle px-4 py-[15px] text-[14px] whitespace-nowrap text-secondary group-last:border-b-0">
                  {formatDuration(run.durationSeconds)}
                </td>
                <td className="border-b border-line-subtle px-4 py-[15px] text-[14px] whitespace-nowrap text-secondary group-last:border-b-0">
                  {formatPace(run)}
                </td>
                <td className="border-b border-line-subtle px-4 py-[15px] group-last:border-b-0">
                  <EffortChip effort={run.effort} />
                </td>
                {/* The kebab opens the row menu with Edit and Delete
                    (RUN-29); its subtree swallows clicks so nothing in it
                    falls through to the row navigation. */}
                <td className="border-b border-line-subtle py-[15px] pr-4 pl-2 text-right group-last:border-b-0">
                  <RunRowMenu run={run} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The same runs as cards below `md`. These scroll with the page - an
          inner scrollbox under a thumb is harder to use than the page itself. */}
      <ul
        data-testid="runs-cards"
        className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-white md:hidden"
      >
        {runs.map((run) => (
          <li
            key={run.id}
            className="flex items-start justify-between gap-2 border-b border-line-subtle px-4 py-4 last:border-b-0"
          >
            <Link href={runDetailHref(run)} className="flex min-w-0 flex-1 flex-col gap-[10px]">
              <span className="flex min-w-0 items-center gap-[10px]">
                <EffortDot effort={run.effort} />
                <span className="truncate text-[14.5px] font-medium text-text-primary">
                  {run.routeName}
                </span>
                <EffortChip effort={run.effort} />
              </span>
              <span className="pl-[19px] text-[13px] text-secondary">
                {formatDate(run.date)} · {run.distanceKm.toFixed(1)} km ·{' '}
                {formatDuration(run.durationSeconds)} · {formatPace(run)}
              </span>
            </Link>
            <RunRowMenu run={run} sizeClassName="-mt-1 -mr-1 size-11" />
          </li>
        ))}
      </ul>
    </>
  );
}
