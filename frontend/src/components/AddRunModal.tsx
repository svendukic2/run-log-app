'use client';

import { useEffect, useRef, useState } from 'react';
import EffortField from '@/components/EffortField';
import TextArea from '@/components/TextArea';
import TextField from '@/components/TextField';
import {
  addRun,
  emptyRunForm,
  toRunDraft,
  validateRunForm,
  type RunFormErrors,
  type RunFormField,
  type RunFormValues,
} from '@/lib/runs';

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export const ADD_RUN_TITLE_ID = 'add-run-title';

// Field ids double as the anchor for "focus the first thing that failed", so
// they live in one place and in the order the form reads.
const FIELD_IDS: Record<RunFormField, string> = {
  routeName: 'run-route-name',
  distance: 'run-distance',
  duration: 'run-duration',
  date: 'run-date',
};
const FIELD_ORDER: RunFormField[] = ['routeName', 'distance', 'duration', 'date'];

interface AddRunModalProps {
  onClose: () => void;
}

// "Add run" modal (design node 67:345). Rendered only while open, so every
// opening is a fresh mount: the date is today's and the effort is Medium
// without anything having to reset them (AC1).
//
// Dismissal mirrors the shell's navigation drawer (Escape, scrim click) so the
// two overlays behave the same. Below `sm` the card is a bottom sheet, which
// keeps it reachable one-handed instead of floating mid-screen, and the form
// scrolls inside a capped card so the buttons stay on screen on a short phone.
export default function AddRunModal({ onClose }: AddRunModalProps) {
  const [values, setValues] = useState<RunFormValues>(emptyRunForm);
  const [errors, setErrors] = useState<RunFormErrors>({});
  const routeNameRef = useRef<HTMLInputElement>(null);

  const setValue = <Field extends keyof RunFormValues>(field: Field, value: RunFormValues[Field]) =>
    setValues((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    // Land on the first field: the point of the modal is logging a run in
    // seconds, and it keeps keyboard and screen-reader users out from behind
    // the scrim.
    routeNameRef.current?.focus();

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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateRunForm(values);
    setErrors(nextErrors);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      // Nothing is saved and the modal stays open (AC4); moving focus means the
      // error is announced and reachable without hunting for it.
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }

    // Pace is derived from what was entered, never asked for (ADD-4).
    addRun(toRunDraft(values));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        data-testid="add-run-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-ink/60"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={ADD_RUN_TITLE_ID}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[20px] bg-white shadow-[0_24px_60px_0_rgba(0,0,0,0.22)] sm:max-h-[calc(100dvh-48px)] sm:rounded-[20px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-5 sm:pt-[24px] sm:pr-[24px] sm:pb-[24px] sm:pl-[28px]">
          <h2
            id={ADD_RUN_TITLE_ID}
            className="font-display text-[20px] font-bold tracking-[-0.4px] text-text-primary"
          >
            Add run
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-secondary hover:bg-muted hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto overscroll-contain border-y border-muted px-5 pt-5 pb-[26px] sm:px-[28px] sm:pt-[24px]">
            <TextField
              ref={routeNameRef}
              id={FIELD_IDS.routeName}
              label="Route name"
              placeholder="e.g. Evening tempo"
              value={values.routeName}
              onChange={(value) => setValue('routeName', value)}
              error={errors.routeName}
            />

            {/* Two up in the design; stacked on a phone, where a shared row
                leaves neither field wide enough to read its own value. */}
            <div className="flex flex-col gap-[18px] sm:flex-row sm:gap-4">
              <TextField
                id={FIELD_IDS.distance}
                label="Distance (km)"
                placeholder="0.0"
                inputMode="decimal"
                value={values.distance}
                onChange={(value) => setValue('distance', value)}
                error={errors.distance}
              />
              <TextField
                id={FIELD_IDS.duration}
                label="Duration"
                placeholder="00:00"
                inputMode="numeric"
                value={values.duration}
                onChange={(value) => setValue('duration', value)}
                error={errors.duration}
              />
            </div>

            {/* A native date input in place of the designed calendar glyph: it
                brings its own picker, and on a phone that is the OS wheel
                rather than a control we would have to build. */}
            <TextField
              id={FIELD_IDS.date}
              type="date"
              label="Date"
              value={values.date}
              onChange={(value) => setValue('date', value)}
              error={errors.date}
            />

            <EffortField value={values.effort} onChange={(effort) => setValue('effort', effort)} />

            <TextArea
              id="run-note"
              label="Note (optional)"
              placeholder="How did it feel? Terrain, weather, splits…"
              value={values.note}
              onChange={(value) => setValue('note', value)}
            />
          </div>

          {/* Full-width and stacked on a phone, which puts "Save run" closest
              to the thumb without reordering it away from the design. */}
          <div className="flex shrink-0 flex-col gap-3 px-5 py-4 sm:flex-row sm:justify-end sm:gap-[12px] sm:px-[28px] sm:py-[18px]">
            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center justify-center rounded-[14px] border border-line-strong bg-white px-[28px] py-[16px] text-[16px] font-semibold text-text-primary hover:bg-muted sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-[9px] rounded-[14px] bg-accent px-[28px] py-[16px] text-[16px] font-semibold text-white hover:bg-accent-pressed sm:w-auto"
            >
              Save run
              <span aria-hidden="true" className="text-[17px]">
                →
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
