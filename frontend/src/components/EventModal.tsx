'use client';

import { useEffect, useRef, useState } from 'react';
import TextArea from '@/components/TextArea';
import TextField from '@/components/TextField';
import {
  createEvent,
  emptyEventForm,
  toEventDraft,
  validateEventForm,
  type EventFormErrors,
  type EventFormField,
  type EventFormValues,
} from '@/lib/events';
import { mutationErrorMessage } from '@/lib/session';

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export const EVENT_MODAL_TITLE_ID = 'event-modal-title';

// Field ids double as the anchor for "focus the first thing that failed",
// declared in the order the form reads. The focus order is derived from
// the same declaration (string-key insertion order is guaranteed), so a
// new field cannot be added to one and forgotten in the other.
const FIELD_IDS: Record<EventFormField, string> = {
  name: 'event-name',
  description: 'event-description',
  startDate: 'event-start-date',
  endDate: 'event-end-date',
  targetKm: 'event-target-km',
};
const FIELD_ORDER = Object.keys(FIELD_IDS) as EventFormField[];

interface EventModalProps {
  onClose: () => void;
}

// The Create event modal (RUN-68 AC3), mirroring the Add run modal pattern:
// rendered only while open so every opening is a fresh mount (both dates
// prefilled with today), validating inline with the date pair rule, saving
// through the store and keeping itself open with everything typed intact
// when the API says no. Dismissal matches the app's other overlays
// (Escape, scrim click), and below `sm` the card is a bottom sheet.
export default function EventModal({ onClose }: EventModalProps) {
  const [values, setValues] = useState<EventFormValues>(emptyEventForm);
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const setValue = <Field extends keyof EventFormValues>(
    field: Field,
    value: EventFormValues[Field],
  ) => setValues((current) => ({ ...current, [field]: value }));

  // Dismissal is refused while a save is in flight (review fix): closing
  // mid-save would unmount the modal, a late failure's inline error would
  // land on an unmounted component, and the user would walk away believing
  // an event exists that was never created. Every dismissal path - Escape
  // here, the scrim, Cancel and the X below - shares the gate.
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  useEffect(() => {
    nameRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const nextErrors = validateEventForm(values);
    setErrors(nextErrors);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      // Nothing is saved and the modal stays open; moving focus means the
      // error is announced and reachable without hunting for it.
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await createEvent(toEventDraft(values));
      onClose();
    } catch (cause) {
      // The failure keeps the modal open with everything typed intact:
      // closing would silently discard an event the user believes exists.
      setSaving(false);
      setSaveError(mutationErrorMessage(cause));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        data-testid="event-modal-backdrop"
        onClick={saving ? undefined : onClose}
        className="fixed inset-0 bg-ink/60"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={EVENT_MODAL_TITLE_ID}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[20px] bg-white shadow-[0_24px_60px_0_rgba(0,0,0,0.22)] sm:max-h-[calc(100dvh-48px)] sm:rounded-[20px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-5 sm:pt-[24px] sm:pr-[24px] sm:pb-[24px] sm:pl-[28px]">
          <h2
            id={EVENT_MODAL_TITLE_ID}
            className="font-display text-[20px] font-bold tracking-[-0.4px] text-text-primary"
          >
            Create event
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-secondary hover:bg-muted hover:text-ink disabled:cursor-default disabled:opacity-60"
          >
            <CloseIcon />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto overscroll-contain border-y border-muted px-5 pt-5 pb-[26px] sm:px-[28px] sm:pt-[24px]">
            <TextField
              ref={nameRef}
              id={FIELD_IDS.name}
              label="Name"
              placeholder="e.g. Summer 100k"
              value={values.name}
              onChange={(value) => setValue('name', value)}
              error={errors.name}
            />

            <TextArea
              id={FIELD_IDS.description}
              label="Description (optional)"
              placeholder="What's the plan? Who is it for?"
              value={values.description}
              onChange={(value) => setValue('description', value)}
              error={errors.description}
            />

            {/* Two up in the design; stacked on a phone, where a shared row
                leaves neither date wide enough to read (the RunModal
                reasoning). Native date inputs bring the OS picker. */}
            <div className="flex flex-col gap-[18px] sm:flex-row sm:gap-4">
              <TextField
                id={FIELD_IDS.startDate}
                type="date"
                label="Start date"
                value={values.startDate}
                onChange={(value) => setValue('startDate', value)}
                error={errors.startDate}
              />
              <TextField
                id={FIELD_IDS.endDate}
                type="date"
                label="End date"
                value={values.endDate}
                onChange={(value) => setValue('endDate', value)}
                error={errors.endDate}
              />
            </div>

            <TextField
              id={FIELD_IDS.targetKm}
              label="Target km (optional)"
              placeholder="e.g. 100"
              inputMode="decimal"
              value={values.targetKm}
              onChange={(value) => setValue('targetKm', value)}
              error={errors.targetKm}
            />
          </div>

          <div className="flex shrink-0 flex-col gap-3 px-5 py-4 sm:px-[28px] sm:py-[18px]">
            {saveError && (
              <p role="alert" className="text-[13px] leading-[1.5] text-accent-pressed">
                {saveError}
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:gap-[12px]">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex w-full items-center justify-center rounded-[14px] border border-line-strong bg-white px-[28px] py-[16px] text-[16px] font-semibold text-text-primary hover:bg-muted disabled:cursor-default disabled:opacity-60 sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-[9px] rounded-[14px] bg-accent px-[28px] py-[16px] text-[16px] font-semibold text-white hover:bg-accent-pressed disabled:cursor-default disabled:opacity-60 sm:w-auto"
              >
                {saving ? 'Saving…' : 'Create event'}
                <span aria-hidden="true" className="text-[17px]">
                  →
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
