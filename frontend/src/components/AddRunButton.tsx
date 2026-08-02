'use client';

import { useRef, useState } from 'react';
import AddRunModal from '@/components/AddRunModal';

// The primary "Add run" action from the design library (node 48:38): accent
// pill with the label and a trailing arrow. It owns the Add run modal, so every
// header that renders it can open the modal without wiring state of its own.
// Full width below `sm`, where the header stacks (RUN-15, responsive addendum).
export default function AddRunButton() {
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
        Add run
        <span aria-hidden="true" className="text-[17px]">
          →
        </span>
      </button>

      <AddRunModal isOpen={isModalOpen} onClose={closeModal} />
    </>
  );
}
