'use client';

import { ACCENT_PILL_CLASSES } from '@/components/accentPill';
import EventModal from '@/components/EventModal';
import { useAddRunModal } from '@/lib/useAddRunModal';

interface CreateEventButtonProps {
  // "Create event" in the page header; the empty state re-labels the same
  // pill "Create your first event" (RUN-68 AC4).
  label?: string;
}

// The primary "Create event" action (RUN-68): the same accent pill as
// AddRunButton, owning the Create event modal so every surface that renders
// it can open the modal without wiring state of its own. The modal
// lifecycle hook is shared with the run modal - it manages open state and
// trigger focus, nothing run-specific.
export default function CreateEventButton({ label = 'Create event' }: CreateEventButtonProps) {
  const { isOpen, open, close, triggerRef } = useAddRunModal<HTMLButtonElement>();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        className={`${ACCENT_PILL_CLASSES} sm:w-auto`}
      >
        {label}
        <span aria-hidden="true" className="text-[17px]">
          →
        </span>
      </button>

      {/* Mounted only while open, so each opening starts from a clean form
          with both dates prefilled to today (AC3). */}
      {isOpen ? <EventModal onClose={close} /> : null}
    </>
  );
}
