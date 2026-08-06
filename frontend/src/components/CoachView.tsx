'use client';

import { useEffect, useRef, useState } from 'react';
import CoachEmptyState from '@/components/CoachEmptyState';
import CurrentPlanCard from '@/components/CurrentPlanCard';
import GeneratingPlanCard from '@/components/GeneratingPlanCard';
import InsightCards from '@/components/InsightCards';
import PreviousPlansCard from '@/components/PreviousPlansCard';
import { stampPlanGenerated } from '@/lib/plan';
import { useRuns } from '@/lib/runs';
import { useHydrated } from '@/lib/useHydrated';

// How long the simulated analysis of AIC-8 shows before the fresh plan
// (AIC-9). This is a view duration, not a domain one: there is no async
// generation behind it, only the derive-in-render formula plus a new stamp,
// and the pause is what makes the recomputation legible as an action.
export const PLAN_GENERATION_MS = 1800;

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
  const landingRef = useRef<HTMLDivElement>(null);

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

  // Regeneration (RUN-35, AIC-8/9). The plan derives from the runs store, so
  // "generating" is the simulated analysis pause followed by a fresh stamp;
  // the page owns the state because the swap dims the neighbouring cards
  // too. Navigating away mid-generation simply discards the pause: no stamp
  // moves, and the page comes back showing the derived plan as always.
  const [generating, setGenerating] = useState(false);
  // What the sr-only status line reads; lives outside the busy subtree so
  // the announcement is never muted by its own aria-busy.
  const [regenStatus, setRegenStatus] = useState('');
  const planSlotRef = useRef<HTMLDivElement>(null);
  const generationTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (generationTimer.current !== null) window.clearTimeout(generationTimer.current);
    };
  }, []);

  const startRegeneration = () => {
    // The pending timeout is the resource being protected, so it is what
    // the guard checks (the state value could lag a render behind).
    if (generationTimer.current !== null) return;
    setGenerating(true);
    setRegenStatus('Generating a new plan.');
    generationTimer.current = window.setTimeout(() => {
      generationTimer.current = null;
      // A22: a failed stamp keeps the previous caption, which with a derived
      // plan is keeping the previous plan; the status line says so instead
      // of pretending. Stamping before the swap-back means the remounting
      // card reads the fresh value (its "now" re-initialises on mount, which
      // is what turns the caption into "updated just now").
      const stamped = stampPlanGenerated(Date.now());
      setGenerating(false);
      setRegenStatus(stamped ? 'New plan ready.' : 'Plan unchanged.');
    }, PLAN_GENERATION_MS);
  };

  // The Regenerate button unmounts with the card it lives on, which would
  // drop keyboard focus onto <body>. Focus lands on the stable slot while
  // generating; on completion it returns to Regenerate, but only if the
  // user left it there - stealing focus back from someone who tabbed away
  // mid-generation would be worse than the problem being solved.
  const wasGenerating = useRef(false);
  useEffect(() => {
    const slot = planSlotRef.current;
    if (generating && !wasGenerating.current) {
      slot?.focus();
    }
    if (!generating && wasGenerating.current) {
      if (slot && document.activeElement && slot.contains(document.activeElement)) {
        slot.querySelector<HTMLButtonElement>('[data-regenerate]')?.focus();
      }
    }
    wasGenerating.current = generating;
  }, [generating]);

  // localStorage is invisible to the server and the hydration pass; a
  // returning runner must not get "Coaching starts after your first run"
  // flashed at them.
  if (!hydrated) return null;

  if (!hasRuns) return <CoachEmptyState />;

  // The wrapper is the post-save focus landing (see the effect above).
  return (
    <div ref={landingRef} tabIndex={-1} className="flex flex-col gap-5 outline-none">
      {/* Stable plan slot: it owns the busy flag and the focus anchor, so
          the card swap underneath can neither drop focus nor leave aria-busy
          stuck on one value forever. */}
      <div ref={planSlotRef} tabIndex={-1} aria-busy={generating} className="outline-none">
        {generating ? <GeneratingPlanCard /> : <CurrentPlanCard onRegenerate={startRegeneration} />}
      </div>
      {/* Always mounted and outside the busy subtree, so both transitions
          ("Generating a new plan." / "New plan ready.") are announced. */}
      <p role="status" data-testid="regen-status" className="sr-only">
        {regenStatus}
      </p>
      {/* The neighbours dim while generating (AIC-8). Visual de-emphasis
          only: their content stays in the accessibility tree, and their only
          controls are already-inert seams, so pointer-events covers the
          rest. The inner gap must mirror the parent column's gap-5 or the
          wrapper shows up as uneven vertical rhythm. */}
      <div
        className={`flex flex-col gap-5 motion-safe:transition-opacity ${
          generating ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        <InsightCards />
        <PreviousPlansCard />
      </div>
    </div>
  );
}
