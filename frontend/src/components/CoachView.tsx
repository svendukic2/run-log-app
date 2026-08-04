'use client';

import { useEffect, useRef } from 'react';
import CoachEmptyState from '@/components/CoachEmptyState';
import { useRuns } from '@/lib/runs';
import { useHydrated } from '@/lib/useHydrated';

// Switches the AI Coach page between the empty hero (14, RUN-31) and the
// coaching content. Reading the runs store here means saving the first run
// swaps the hero out immediately.
export default function CoachView() {
  const hydrated = useHydrated();
  const runs = useRuns();
  const hasRuns = runs.length > 0;

  // Saving the first run unmounts the hero together with the button the user
  // just pressed, which would drop keyboard focus onto <body>. When the
  // switch happens live (the hero was actually on screen), focus moves to
  // the content that replaced it. A returning runner never had the hero, so
  // their page load steals no focus.
  const heroWasShown = useRef(false);
  const landingRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!hasRuns) {
      heroWasShown.current = true;
      return;
    }
    if (heroWasShown.current) {
      heroWasShown.current = false;
      landingRef.current?.focus();
    }
  }, [hydrated, hasRuns]);

  // localStorage is invisible to the server and the hydration pass; a
  // returning runner must not get "Coaching starts after your first run"
  // flashed at them.
  if (!hydrated) return null;

  if (!hasRuns) return <CoachEmptyState />;

  // The current plan card and the rest of 15 land with RUN-32; until then
  // this announced seam keeps the page from being blank and gives the
  // post-save focus somewhere to land.
  return (
    <p
      ref={landingRef}
      tabIndex={-1}
      aria-live="polite"
      className="text-[14.5px] text-secondary outline-none"
    >
      Your coaching plan arrives in an upcoming update.
    </p>
  );
}
