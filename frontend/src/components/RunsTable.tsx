'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EFFORT_DOT } from '@/components/EffortField';
import { ROUTES } from '@/lib/routes';
import { formatDate, formatDuration, formatPace, type Effort, type Run } from '@/lib/runs';

// Chip fills for the EFFORT column (design node 57:51): Easy green, Medium
// amber, Hard coral (RUN-24 AC3). Text uses the darker "* Text" tokens so the
// chips stay readable on their soft fills, and the row dot reuses EFFORT_DOT
// so an effort reads the same here as in the Add run modal.
const EFFORT_CHIP: Record<Effort, string> = {
  Easy: 'bg-success-soft text-success-text',
  Medium: 'bg-warning-soft text-warning-text',
  Hard: 'bg-accent-soft text-accent-pressed',
};

// Run detail is its own screen (09), built with RUN-27; until it lands this
// path 404s, which is the agreed seam between the two tickets.
function runDetailHref(run: Pick<Run, 'id'>): string {
  return `${ROUTES.runs}/${run.id}`;
}

const COLUMNS = ['Route', 'Date', 'Distance', 'Duration', 'Pace', 'Effort'];

function KebabIcon() {
  return (
    <svg width="4" height="16" viewBox="0 0 4 16" fill="none" aria-hidden="true">
      <circle cx="2" cy="2" r="1.7" fill="currentColor" />
      <circle cx="2" cy="8" r="1.7" fill="currentColor" />
      <circle cx="2" cy="14" r="1.7" fill="currentColor" />
    </svg>
  );
}

// Kebab per row (AC3, AC6). Visible and focusable now; the menu it opens is
// RUN-29, so until then the press is deliberately inert. It still swallows the
// click so a missed tap does not fall through to the row navigation. The card
// variant passes a larger hit area: on a phone the button sits beside a
// full-card link, where a missed 32px tap would navigate instead.
function KebabButton({
  routeName,
  sizeClassName = 'size-8',
}: {
  routeName: string;
  sizeClassName?: string;
}) {
  return (
    <button
      type="button"
      aria-label={`Open menu for ${routeName}`}
      onClick={(event) => event.stopPropagation()}
      className={`flex shrink-0 items-center justify-center rounded-[8px] text-tertiary hover:bg-muted hover:text-text-primary ${sizeClassName}`}
    >
      <KebabIcon />
    </button>
  );
}

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
      <div className="hidden max-h-[576px] overflow-y-auto rounded-[18px] border border-line bg-white md:block">
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
                <td className="border-b border-line-subtle py-[15px] pr-4 pl-2 text-right group-last:border-b-0">
                  <KebabButton routeName={run.routeName} />
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
            <KebabButton routeName={run.routeName} sizeClassName="-mt-1 -mr-1 size-11" />
          </li>
        ))}
      </ul>
    </>
  );
}
