'use client';

import { useEffect, useRef } from 'react';

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export const ADD_RUN_TITLE_ID = 'add-run-title';

interface AddRunModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Shell of the "Add run" modal (node 67:345): scrim, card, title and X close.
// RUN-15 only needs the header action to open a real dialog over the page; the
// six fields and their validation arrive with RUN-23 and render in the body
// below. Dismissal mirrors the shell's navigation drawer (Escape, scrim click)
// so the two overlays behave the same. Below `sm` the card is a bottom sheet,
// which keeps it reachable one-handed instead of floating mid-screen.
export default function AddRunModal({ isOpen, onClose }: AddRunModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Move focus into the dialog so keyboard and screen-reader users are not
    // left behind the scrim.
    closeButtonRef.current?.focus();

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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain sm:items-center sm:p-6">
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
        className="relative z-10 flex w-full max-w-[560px] flex-col rounded-t-[20px] bg-white pb-6 sm:rounded-[20px]"
      >
        <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-[28px] sm:py-[24px]">
          <h2
            id={ADD_RUN_TITLE_ID}
            className="font-display text-[20px] font-bold tracking-[-0.4px] text-text-primary"
          >
            Add run
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-secondary hover:bg-muted hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
