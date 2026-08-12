'use client';

import { useEffect, useRef, useState } from 'react';
import { deleteRun, type Run } from '@/lib/runs';
import useFocusTrap from '@/lib/useFocusTrap';

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 4.1h12M6 4.1V2.6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M3.6 4.1l.7 9.2a1.1 1.1 0 0 0 1.1 1h5.2a1.1 1.1 0 0 0 1.1-1l.7-9.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TITLE_ID = 'delete-run-title';
const DESCRIPTION_ID = 'delete-run-description';

interface DeleteRunDialogProps {
  run: Run;
  // Cancel, Escape or a scrim click: the dialog closes and the run is
  // untouched (DEL-2, AC3).
  onClose: () => void;
  // The run is gone from the store; the opener decides what happens to the
  // screen it lived on (the table row unmounts by itself, Run detail
  // navigates back to the list).
  onDeleted: () => void;
}

// The delete confirmation of 13 · Delete confirmation (RUN-30, DEL-1): the
// dialog quotes the run it is about to remove and says the removal is
// permanent, so the destructive button never acts on an unnamed thing.
// Deleting writes the store, and every screen deriving from it - list, count
// badge, dashboard, records - recomputes on the announcement (DEL-3, AC2/AC4).
//
// Dismissal mirrors RunModal (Escape, scrim click), and below `sm` the card
// is the same bottom sheet with stacked full-width buttons, keeping the
// actions one-handed on a phone (responsive addendum, agreed in-project).
export default function DeleteRunDialog({ run, onClose, onDeleted }: DeleteRunDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The delete round-trips to the API since RUN-48: `deleting` guards the
  // destructive button against a double press, `deleteError` is the inline
  // failure line (dialog stays open, the run still exists).
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Tab stays inside the dialog, as aria-modal already claimed (RUN-75).
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    // Focus lands on Cancel: the safe answer to a destructive question, so
    // Enter pressed out of habit deletes nothing.
    cancelRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);

    // Stop the page behind the dialog from scrolling under the user's finger.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // A run already gone (deleted elsewhere) is not an error: the outcome
      // the user asked for holds either way, so both resolutions continue to
      // onDeleted and the screens refresh from whatever the cache now says.
      await deleteRun(run.id);
      onDeleted();
    } catch (error) {
      // A failed API call is different: the run still exists, so pretending
      // it is gone would be worse than admitting the failure.
      setDeleting(false);
      setDeleteError(
        error instanceof Error && error.message
          ? error.message
          : "Deleting failed. Check that you're online and try again.",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        data-testid="delete-run-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-ink/60"
      />

      {/* max-h + overflow: the other two overlays cap themselves and scroll
          inside, this one did not, so a long route name on a short phone in
          landscape pushed the title off the top of the screen with no way to
          reach it (RUN-75, AC4). The cap is never hit at desktop size, where
          the dialog is a few hundred pixels tall. */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-describedby={DESCRIPTION_ID}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col gap-[18px] overflow-y-auto overscroll-contain rounded-t-[20px] bg-white px-5 py-6 shadow-[0_24px_60px_0_rgba(0,0,0,0.22)] sm:max-h-[calc(100dvh-48px)] sm:max-w-[400px] sm:rounded-[20px] sm:p-[28px]"
      >
        <span
          aria-hidden="true"
          className="flex size-[40px] items-center justify-center rounded-full bg-accent-soft text-accent"
        >
          <TrashIcon />
        </span>

        <div className="flex flex-col gap-[8px]">
          <h2
            id={TITLE_ID}
            className="font-display text-[19px] font-bold tracking-[-0.3px] text-text-primary"
          >
            Delete this run?
          </h2>
          {/* The dialog quotes a free-text route name, so it breaks rather
              than widening the card (RUN-75, AC2). */}
          <p
            id={DESCRIPTION_ID}
            className="text-[13.5px] leading-[1.55] break-words text-secondary"
          >
            &ldquo;{run.routeName}&rdquo; will be permanently removed from your log. This action
            can&rsquo;t be undone.
          </p>
        </div>

        {/* The API-failure line (RUN-48); role=alert so it is announced. */}
        {deleteError && (
          <p role="alert" className="text-[13px] leading-[1.5] text-accent-pressed">
            {deleteError}
          </p>
        )}

        {/* Full-width and stacked on a phone, like RunModal's footer; two-up
            from `sm`, Cancel leading as the design draws it. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-[12px]">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center rounded-[12px] border border-line-strong bg-white px-[24px] py-[13px] text-[15px] font-semibold text-text-primary hover:bg-muted sm:flex-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex w-full items-center justify-center rounded-[12px] bg-accent px-[24px] py-[13px] text-[15px] font-semibold text-white hover:bg-accent-pressed disabled:cursor-default disabled:opacity-60 sm:flex-1"
          >
            {deleting ? 'Deleting…' : 'Delete run'}
          </button>
        </div>
      </div>
    </div>
  );
}
