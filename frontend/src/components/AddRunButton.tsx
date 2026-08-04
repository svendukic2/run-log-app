'use client';

import RunModal from '@/components/RunModal';
import { useAddRunModal } from '@/lib/useAddRunModal';

interface AddRunButtonProps {
  // The pill's label; the headers keep the library's "Add run", while the
  // Dashboard (RUN-18) and Runs (RUN-25 AC2) empty states re-label the same
  // pill "Add your first run".
  label?: string;
  // The coach teaser card (RUN-21) keeps the pill full width at every
  // breakpoint; headers still collapse it to content width from `sm` up.
  fullWidth?: boolean;
}

// The accent pill of the primary action, shared with link-shaped variants
// (the coach teaser's "Open coach", RUN-21) so the two cannot drift apart.
export const ACCENT_PILL_CLASSES =
  'flex w-full shrink-0 items-center justify-center gap-[9px] rounded-[14px] bg-accent px-[28px] py-[16px] text-[16px] font-semibold text-white hover:bg-accent-pressed';

// The primary "Add run" action from the design library (node 48:38): accent
// pill with the label and a trailing arrow. It owns the Add run modal, so every
// surface that renders it can open the modal without wiring state of its own.
// Full width below `sm`, where the header stacks (RUN-15, responsive addendum).
export default function AddRunButton({ label = 'Add run', fullWidth = false }: AddRunButtonProps) {
  const { isOpen, open, close, triggerRef } = useAddRunModal<HTMLButtonElement>();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        className={fullWidth ? ACCENT_PILL_CLASSES : `${ACCENT_PILL_CLASSES} sm:w-auto`}
      >
        {label}
        <span aria-hidden="true" className="text-[17px]">
          →
        </span>
      </button>

      {/* Mounted only while open, so each opening starts from a clean form
          (RUN-23 AC1). No `run` prop: this pill always adds. */}
      {isOpen ? <RunModal onClose={close} /> : null}
    </>
  );
}
