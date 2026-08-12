'use client';

import { useEffect, type RefObject } from 'react';

// Everything a browser lets Tab land on. Deliberately not a full a11y-grade
// list: the overlays in this app hold links, buttons and form controls only.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isRendered(element: HTMLElement): boolean {
  // This is what excludes the Add run modal's step 1 while step 2 is open: its
  // inputs stay mounted (they ARE the run, unmounting would discard what was
  // typed) but they are display:none, and Tab must not stop on them. Under
  // Jest there is no layout engine and no stylesheet, so nothing is hidden
  // there either and answering "rendered" is both true and harmless.
  return typeof element.checkVisibility === 'function' ? element.checkVisibility() : true;
}

// Keeps Tab inside an open overlay while `active`.
//
// Without it every overlay in the app leaks focus onto the page behind its own
// backdrop: reachable by keyboard, unclickable by mouse, with an overlay still
// on screen. The notifications panel already fixed this for itself in RUN-66
// by closing on focusout; the drawer and the three dialogs cannot close on
// focusout (they are modal, not dismissable popups), so they wrap instead
// (RUN-75, AC4 and AC5).
export default function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;

      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        isRendered,
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      // Only the two ends are handled. In between, the browser's own tab order
      // is already right, and overriding it would break nested widgets that
      // manage their own arrow-key navigation.
      if (current instanceof Node && !container.contains(current)) {
        // Focus is already outside, so the next Tab would walk the page under
        // the backdrop. Pull it back to whichever end the direction implies.
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, containerRef]);
}
