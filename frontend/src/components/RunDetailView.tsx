'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import DeleteRunDialog from '@/components/DeleteRunDialog';
import RunModal from '@/components/RunModal';
import { ROUTES } from '@/lib/routes';
import {
  EFFORT_CHIP,
  formatDate,
  formatDistanceKm,
  formatDuration,
  formatPace,
  useRuns,
} from '@/lib/runs';
import { useHydrated } from '@/lib/useHydrated';

// A decorative route sketch with a start and an end dot, explicitly not a map
// (DET-4): no coordinates exist to draw one from.
function RouteSketch() {
  return (
    <svg
      viewBox="0 0 680 260"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      data-testid="route-sketch"
      className="h-auto w-full text-accent"
      fill="none"
    >
      <path
        d="M44 186 C 84 224, 142 148, 212 158 C 282 168, 330 214, 402 178 C 474 142, 546 92, 636 112"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle data-testid="route-start" cx="44" cy="186" r="5.5" fill="currentColor" />
      <circle
        data-testid="route-end"
        cx="636"
        cy="112"
        r="6"
        stroke="currentColor"
        strokeWidth="3.5"
        fill="white"
      />
    </svg>
  );
}

const CARD = 'rounded-[18px] border border-line bg-white';

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={`${CARD} flex flex-col gap-[8px] px-[24px] py-[22px]`}>
      <span className="text-[11px] font-medium tracking-[0.66px] text-tertiary uppercase">
        {label}
      </span>
      <span className="font-display text-[22px] font-bold tracking-[-0.4px] text-text-primary">
        {value}
      </span>
    </div>
  );
}

// Everything about one run (RUN-27, 09 · Run detail): header with breadcrumb,
// effort badge and Edit/Delete, four stat cards, the decorative Route card,
// the Note card (only when a note exists, A11) and the Details card. Start
// time, elevation and route type are never captured in Add/Edit, so they stay
// empty for user-created runs (DET-7, A10).
export default function RunDetailView({ runId }: { runId: string }) {
  const hydrated = useHydrated();
  const runs = useRuns();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  // Dismissing the modal hands focus back to the button that opened it,
  // mirroring AddRunButton. Stable across renders: this view re-renders on
  // every store change, and a fresh callback would re-run the modal's mount
  // effect and yank focus back to its first field mid-typing.
  const closeEditModal = useCallback(() => {
    setIsEditing(false);
    editButtonRef.current?.focus();
  }, []);

  // Cancelling the delete works the same way (RUN-30 AC3); confirming leaves
  // the page instead - this run no longer exists, so the honest destination
  // is the list it came from, minus one row.
  const closeDeleteDialog = useCallback(() => {
    setIsDeleting(false);
    deleteButtonRef.current?.focus();
  }, []);

  const leaveAfterDelete = useCallback(() => {
    router.push(ROUTES.runs);
  }, [router]);

  // Runs live in localStorage, which the server and the hydration pass cannot
  // see, so the shell stays neutral until the store has been read.
  if (!hydrated) return null;

  const run = runs.find((candidate) => candidate.id === runId);
  // A confirmed delete removes the run from the store before the navigation
  // back to the list lands; isDeleting is still true in that window, so the
  // page goes blank for a frame instead of flashing "Run not found".
  if (!run) return isDeleting ? null : <NotFound />;

  const details: Array<{ label: string; value: string }> = [
    { label: 'Route name', value: run.routeName },
    { label: 'Date', value: formatDate(run.date) },
    { label: 'Effort', value: run.effort },
    { label: 'Logged', value: 'Manual entry' },
  ];

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-6 sm:px-8 lg:px-[40px] lg:pt-[32px] lg:pb-[32px]">
      <header className="flex flex-col gap-[10px]">
        <Link
          href={ROUTES.runs}
          className="flex items-center gap-[8px] self-start text-[13px] text-tertiary hover:text-secondary"
        >
          <span aria-hidden="true">←</span>
          All runs
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] text-text-primary lg:text-[30px]">
            {run.routeName}
          </h1>
          {/* Edit opens the Edit run modal (RUN-28, DET-2); Delete opens the
              confirmation dialog quoting this run (RUN-30, DEL-1). */}
          <div className="flex gap-[10px]">
            <button
              ref={editButtonRef}
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-[12px] border border-line-strong bg-white px-[22px] py-[11px] text-[14.5px] font-semibold text-text-primary hover:bg-muted"
            >
              Edit
            </button>
            <button
              ref={deleteButtonRef}
              type="button"
              onClick={() => setIsDeleting(true)}
              className="rounded-[12px] border border-line-strong bg-white px-[22px] py-[11px] text-[14.5px] font-semibold text-accent hover:bg-accent-soft"
            >
              Delete
            </button>
          </div>
        </div>

        <p
          data-testid="run-detail-caption"
          className="flex items-center gap-[12px] text-[14px] text-secondary"
        >
          {/* Just the date: a start time is never captured for user-created
              runs (DET-7, A10), so the "· 07:20" from the mock never shows. */}
          {formatDate(run.date)}
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-[12px] py-[5px] text-[12.5px] font-semibold ${EFFORT_CHIP[run.effort]}`}
          >
            {run.effort} effort
          </span>
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Distance" value={formatDistanceKm(run.distanceKm)} />
        <StatCard label="Duration" value={formatDuration(run.durationSeconds)} />
        <StatCard label="Avg pace" value={formatPace(run)} />
        {/* Elevation is display-only and never captured (A10). */}
        <StatCard
          label="Elevation"
          value={
            <>
              <span aria-hidden="true">–</span>
              <span className="sr-only">Not captured</span>
            </>
          }
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="route-title" className={CARD}>
          {/* The mock puts a "Road · out & back" caption beside the heading;
              a route type is never captured for user-created runs, so only
              the heading renders (A10). */}
          <div className="border-b border-line px-[28px] py-[20px]">
            <h2
              id="route-title"
              className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary"
            >
              Route
            </h2>
          </div>
          <div className="p-[6px]">
            <div className="rounded-[14px] bg-muted px-6 py-10">
              <RouteSketch />
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-5">
          {/* A run without a note shows no Note card at all (A11); a
              whitespace-only note counts as none. */}
          {run.note?.trim() ? (
            <section aria-labelledby="note-title" className={`${CARD} px-[24px] py-[22px]`}>
              <h2
                id="note-title"
                className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary"
              >
                Note
              </h2>
              {/* pre-line keeps the line breaks the user typed into the
                  textarea. */}
              <p className="mt-[10px] text-[14px] leading-[1.6] whitespace-pre-line text-secondary">
                {run.note}
              </p>
            </section>
          ) : null}

          <section aria-label="Details" className={`${CARD} px-[24px] py-[6px]`}>
            <dl>
              {details.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 border-b border-line py-[14px] last:border-b-0"
                >
                  <dt className="text-[14px] text-secondary">{row.label}</dt>
                  <dd className="text-[14px] font-semibold text-text-primary">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      {/* Mounted only while open, so every opening prefills from the run as
          currently stored (RUN-28 AC1). Saving writes the store and this view
          re-reads it through useRuns, so the header, stats, Note and Details
          all reflect the edit at once (AC2). */}
      {isEditing ? <RunModal run={run} onClose={closeEditModal} /> : null}

      {/* Confirming deletes the run and returns to the list, which has
          already recomputed without it (RUN-30 AC2, DEL-3). */}
      {isDeleting ? (
        <DeleteRunDialog run={run} onClose={closeDeleteDialog} onDeleted={leaveAfterDelete} />
      ) : null}
    </div>
  );
}

// An id that matches nothing: a stale bookmark or a deleted run. Not designed,
// so it stays minimal and points back at the list.
function NotFound() {
  return (
    <div className="flex flex-col items-start gap-[10px] px-5 pt-6 sm:px-8 lg:px-[40px] lg:pt-[32px]">
      <Link
        href={ROUTES.runs}
        className="flex items-center gap-[8px] text-[13px] text-tertiary hover:text-secondary"
      >
        <span aria-hidden="true">←</span>
        All runs
      </Link>
      <h1 className="font-display text-[24px] font-bold tracking-[-0.5px] text-text-primary">
        Run not found
      </h1>
      <p className="text-[14.5px] text-secondary">
        This run does not exist on this device. It may have been deleted.
      </p>
    </div>
  );
}
