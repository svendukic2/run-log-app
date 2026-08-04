'use client';

import { useRef, useState } from 'react';

// Shared lifecycle for any control that owns a RunModal in add mode
// (AddRunButton, the coach hero): open state plus focus handed back to the
// trigger on close. Extracted once the second consumer arrived (RUN-31), so
// the modal's contract has one call site to keep in step per concern.
export function useAddRunModal<T extends HTMLElement>() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<T>(null);

  const open = () => setIsOpen(true);
  // The trigger regains focus on dismissal; when saving unmounts the trigger
  // itself (an empty state making way for content), the caller owns moving
  // focus to whatever replaced it.
  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return { isOpen, open, close, triggerRef };
}
