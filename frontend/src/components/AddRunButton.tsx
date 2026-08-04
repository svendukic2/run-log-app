'use client';

import { useRef, useState } from 'react';
import RunModal from '@/components/RunModal';

interface AddRunButtonProps {
  // The pill's label; the headers keep the library's "Add run", while the
  // Dashboard (RUN-18) and Runs (RUN-25 AC2) empty states re-label the same
  // pill "Add your first run".
  label?: string;
}

// The primary "Add run" action from the design library (node 48:38): accent
// pill with the label and a trailing arrow. It owns the Add run modal, so every
// surface that renders it can open the modal without wiring state of its own.
// Full width below `sm`, where the header stacks (RUN-15, responsive addendum).
export default function AddRunButton({ label = 'Add run' }: AddRunButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Dismissing the modal hands focus back to the button that opened it.
  const closeModal = () => {
    setIsModalOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="flex w-full shrink-0 items-center justify-center gap-[9px] rounded-[14px] bg-accent px-[28px] py-[16px] text-[16px] font-semibold text-white hover:bg-accent-pressed sm:w-auto"
      >
        {label}
        <span aria-hidden="true" className="text-[17px]">
          →
        </span>
      </button>

      {/* Mounted only while open, so each opening starts from a clean form
          (RUN-23 AC1). No `run` prop: this pill always adds. */}
      {isModalOpen ? <RunModal onClose={closeModal} /> : null}
    </>
  );
}
