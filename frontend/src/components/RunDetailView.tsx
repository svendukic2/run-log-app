'use client';

import Link from 'next/link';
import { EFFORT_CHIP } from '@/components/EffortField';
import { ROUTES } from '@/lib/routes';
import {
  formatDate,
  formatDistanceKm,
  formatDuration,
  formatPace,
  useHydrated,
  useRuns,
  type Run,
} from '@/lib/runs';

// Elevation is never captured in Add/Edit (DET-7, assumption A10), so its stat
// card renders a dash rather than 0, which would read as a measured value.
// Start time and route type, the mock's other uncaptured fields, simply leave
// no slot behind - see the caption and Route card comments below.
const EMPTY_VALUE = '–';

function BackArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M8.5 2.5L4 7L8.5 11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Decorative route sketch with a start and an end dot (DET-4, AC4). A drawing,
// not a map: no coordinates are ever captured, so there is nothing to plot.
function RouteSketch() {
  return (
    // `slice` fills the panel edge to edge without distorting: the dots stay
    // circles at every viewport and narrow screens crop instead of smearing.
    <svg
      data-testid="route-sketch"
      aria-hidden="true"
      viewBox="0 0 700 380"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
    >
      {/* Faint street-like strokes, so the panel reads as terrain rather than
          an empty box. */}
      <path d="M60 -20L120 400" stroke="var(--color-line-strong)" strokeWidth="10" opacity="0.35" />
      <path d="M-20 60L720 30" stroke="var(--color-line-strong)" strokeWidth="8" opacity="0.25" />
      <path
        d="M40 210C120 130 200 260 290 200C380 140 430 240 520 190C580 158 640 130 655 122"
        stroke="var(--color-accent)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="40" cy="210" r="7" fill="var(--color-accent)" />
      {/* The end dot's centre is the panel surface, so it reads as a ring on
          whatever the card background becomes. */}
      <circle
        cx="655"
        cy="122"
        r="7"
        fill="var(--color-muted)"
        stroke="var(--color-accent)"
        strokeWidth="4"
      />
    </svg>
  );
}

// The breadcrumb is shared by the run and the not-found state, so "All runs"
// always leads back to Runs - List (07) whatever the id resolved to (AC2).
function Breadcrumb() {
  return (
    <Link
      href={ROUTES.runs}
      className="flex w-fit items-center gap-[6px] text-[13px] text-tertiary hover:text-text-primary"
    >
      <BackArrowIcon />
      All runs
    </Link>
  );
}

// `assistiveValue` replaces the visible value for screen readers: the
// elevation dash means "not recorded", which a bare dash does not announce.
function StatCard({
  label,
  value,
  assistiveValue,
}: {
  label: string;
  value: string;
  assistiveValue?: string;
}) {
  return (
    <div className="flex flex-col gap-[6px] rounded-[18px] border border-line bg-white px-5 py-[18px]">
      <span className="text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase">
        {label}
      </span>
      <span className="font-display text-[22px] font-bold tracking-[-0.4px] text-text-primary">
        <span aria-hidden={assistiveValue ? true : undefined}>{value}</span>
        {assistiveValue ? <span className="sr-only">{assistiveValue}</span> : null}
      </span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-subtle py-[14px] last:border-b-0">
      <dt className="text-[14px] text-secondary">{label}</dt>
      <dd className="text-[14px] font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

interface RunDetailViewProps {
  runId: string;
}

// 09 · Run detail (RUN-27): header with breadcrumb, effort badge and the Edit
// and Delete actions, four stat cards, the decorative Route card, the Note
// card (only when a note exists, A11) and the Details card.
export default function RunDetailView({ runId }: RunDetailViewProps) {
  const runs = useRuns();
  const run: Run | undefined = runs.find((candidate) => candidate.id === runId);

  // Runs live in localStorage, so the server render and the hydration pass
  // both see an empty store. Deciding "not found" is deferred until after
  // hydration so a real run does not flash the missing state first.
  const hydrated = useHydrated();

  if (!run) {
    return (
      <section className="flex flex-col gap-4 px-5 pt-6 pb-6 sm:px-8 lg:px-[40px] lg:pt-[32px] lg:pb-[32px]">
        <Breadcrumb />
        {hydrated ? (
          <div className="flex flex-col items-start gap-2">
            <h1 className="font-display text-[24px] font-bold tracking-[-0.6px] text-text-primary lg:text-[30px]">
              Run not found
            </h1>
            <p className="text-[14.5px] text-secondary">
              This run does not exist on this device. It may have been removed.
            </p>
          </div>
        ) : null}
      </section>
    );
  }

  const stats = [
    { label: 'Distance', value: formatDistanceKm(run.distanceKm) },
    { label: 'Duration', value: formatDuration(run.durationSeconds) },
    { label: 'Avg pace', value: formatPace(run) },
    { label: 'Elevation', value: EMPTY_VALUE, assistiveValue: 'Not recorded' },
  ];

  return (
    <>
      <header className="flex flex-col gap-4 px-5 pt-6 pb-4 sm:px-8 lg:px-[40px] lg:pt-[32px] lg:pb-[22px]">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-col gap-[8px]">
            <Breadcrumb />
            <h1 className="truncate font-display text-[24px] font-bold tracking-[-0.6px] text-text-primary lg:text-[30px]">
              {run.routeName}
            </h1>
            <p className="flex flex-wrap items-center gap-3 text-[13.5px] text-secondary">
              {/* The mock's caption carries a start time ("· 07:20"), but user
                  runs never have one (DET-7), so the date stands alone. */}
              {formatDate(run.date)}
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-[12px] py-[5px] text-[12.5px] font-semibold ${EFFORT_CHIP[run.effort]}`}
              >
                {run.effort} effort
              </span>
            </p>
          </div>

          {/* Edit opens the Edit run modal (11) and Delete the confirmation
              (13); both screens are their own tickets, so until they land the
              presses are deliberately inert - the same seam the kebab button
              uses in the runs table (RUN-29). */}
          <div className="flex shrink-0 items-center gap-[10px]">
            <button
              type="button"
              className="flex-1 rounded-[12px] border border-line-strong bg-white px-[22px] py-[10px] text-[14px] font-medium text-text-primary hover:bg-muted sm:flex-none"
            >
              Edit
            </button>
            <button
              type="button"
              className="flex-1 rounded-[12px] border border-accent-soft bg-white px-[22px] py-[10px] text-[14px] font-medium text-accent hover:bg-accent-soft sm:flex-none"
            >
              Delete
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-5 px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {stats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              assistiveValue={stat.assistiveValue}
            />
          ))}
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <section className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-white lg:flex-[2]">
            {/* The mock puts a "Road · out & back" caption at the right edge
                of this bar, but route type is never captured (DET-7), so the
                heading stands alone. */}
            <div className="border-b border-line px-[24px] py-[18px]">
              <h2 className="font-display text-[16px] font-bold tracking-[-0.2px] text-text-primary">
                Route
              </h2>
            </div>
            <div className="h-[240px] bg-muted sm:h-[340px] lg:h-[420px]">
              <RouteSketch />
            </div>
          </section>

          <div className="flex flex-col gap-5 lg:flex-1">
            {/* A run without a note shows no Note card at all (DET-5, A11). */}
            {run.note ? (
              <section className="flex flex-col gap-[10px] rounded-[18px] border border-line bg-white px-[24px] py-[20px]">
                <h2 className="font-display text-[16px] font-bold tracking-[-0.2px] text-text-primary">
                  Note
                </h2>
                <p className="text-[14px] leading-[1.55] text-secondary">{run.note}</p>
              </section>
            ) : null}

            {/* The design gives this card no visible title; the label keeps it
                a named landmark for screen readers. */}
            <section
              aria-label="Details"
              className="rounded-[18px] border border-line bg-white px-[24px] py-[6px]"
            >
              <dl>
                <DetailRow label="Route name" value={run.routeName} />
                <DetailRow label="Date" value={formatDate(run.date)} />
                <DetailRow label="Effort" value={run.effort} />
                <DetailRow label="Logged" value="Manual entry" />
              </dl>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
