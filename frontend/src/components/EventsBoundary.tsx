'use client';

import { useEffect, useState } from 'react';
import { useHydrated } from '@/lib/useHydrated';
import { EventsGateContext, reloadEvents, useEventsError, useEventsStatus } from '@/lib/events';

// See RunsBoundary for the timing reasoning; the constant is duplicated
// with it on purpose - the two boundaries are siblings, not a family with
// a parent, until a third store makes the abstraction worth extracting
// (flagged for the C2 refactor alongside the backend duplications).
const SPINNER_DELAY_MS = 250;

function LoadingNotice({ immediate }: { immediate: boolean }) {
  const [visible, setVisible] = useState(immediate);

  useEffect(() => {
    if (immediate) return;
    const timer = window.setTimeout(() => setVisible(true), SPINNER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [immediate]);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 px-5 py-6 sm:px-8 lg:px-[40px]" role="status">
      <span
        aria-hidden="true"
        className="size-[18px] rounded-full border-2 border-line border-t-accent motion-safe:animate-spin"
      />
      <p className="text-[13.5px] text-secondary">Loading events…</p>
    </div>
  );
}

// The screen-level gate of the app-wide async pattern (RUN-48) for the
// events store: the Events page renders through this boundary, so loading
// and error handling is decided once. Same two error shapes as
// RunsBoundary: retryable failures carry a Try again, terminal ones (this
// device's identity cannot authenticate) explain the way out instead.
// Children render only when the store is 'ready', learned through
// EventsGateContext, which useEvents() uses to fail loudly on ungated
// screens.
export default function EventsBoundary({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const status = useEventsStatus();
  const error = useEventsError();
  const [retried, setRetried] = useState(false);

  if (!hydrated || status === 'loading') return <LoadingNotice immediate={retried} />;

  if (status === 'error') {
    const terminal = error?.terminal ?? false;
    return (
      <section
        role="alert"
        aria-labelledby="events-error-title"
        className="mx-5 mb-6 flex flex-col items-start gap-[10px] rounded-[18px] border border-line bg-white p-[28px] sm:mx-8 lg:mx-[40px]"
      >
        <h2
          id="events-error-title"
          className="font-display text-[19px] font-bold tracking-[-0.3px] text-text-primary"
        >
          {terminal ? 'Your session has ended' : "Events didn't load"}
        </h2>
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          {error?.message ?? 'Something went wrong loading events.'}
        </p>
        {terminal ? (
          // Same narration as AppDataBoundary: the session layer is already
          // navigating to Sign in when a terminal error is thrown.
          <p className="text-[13.5px] leading-[1.55] text-secondary">
            Taking you to Sign in. Your data is saved and will be there when you sign back in.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => {
              setRetried(true);
              reloadEvents();
            }}
            className="mt-[6px] flex items-center justify-center rounded-[12px] bg-accent px-[22px] py-[11px] text-[14px] font-semibold text-white hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try again
          </button>
        )}
      </section>
    );
  }

  return <EventsGateContext.Provider value={true}>{children}</EventsGateContext.Provider>;
}
