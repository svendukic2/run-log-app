'use client';

import { useEffect, useState } from 'react';
import { useHydrated } from '@/lib/useHydrated';
import {
  clearRunsNotice,
  reloadRuns,
  RunsGateContext,
  useRunsError,
  useRunsNotice,
  useRunsStatus,
} from '@/lib/runs';
import { sessionPersistenceDegraded } from '@/lib/session';

// How long a load may stay invisible before the pending state is admitted
// on screen. Below this the blank moment reads as an instant page (the
// common case: local API, warm dashboard); above it a silent white screen
// reads as a hang, so the spinner takes over. A user-initiated retry skips
// the delay entirely: the whole point of the delay is avoiding flicker on
// loads nobody asked about, and a click is the opposite of that.
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
      <p className="text-[13.5px] text-secondary">Loading your runs…</p>
    </div>
  );
}

// The screen-level gate of the app-wide async pattern (RUN-48): every page
// that derives its UI from the runs store renders through this boundary, so
// the loading and error handling is decided once instead of per card.
//
// Loading renders nothing for the first quarter second (extending the
// useHydrated idiom), then an honest spinner; the request timeout in
// session.ts guarantees it cannot spin forever. Errors get one card in two
// shapes: retryable failures (network, timeout, 5xx) carry a Try again;
// terminal ones (this device's identity cannot authenticate) explain the
// way out instead of offering a button that fails identically forever. v1
// designs none of these states (design-review note in the PR). Children
// render only when the store is 'ready', and they learn that through
// RunsGateContext, which useRuns() uses to fail loudly on ungated screens.
export default function RunsBoundary({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const status = useRunsStatus();
  const error = useRunsError();
  const notice = useRunsNotice();
  const [retried, setRetried] = useState(false);

  if (!hydrated || status === 'loading') return <LoadingNotice immediate={retried} />;

  if (status === 'error') {
    const terminal = error?.terminal ?? false;
    return (
      <section
        role="alert"
        aria-labelledby="runs-error-title"
        className="mx-5 mb-6 flex flex-col items-start gap-[10px] rounded-[18px] border border-line bg-white p-[28px] sm:mx-8 lg:mx-[40px]"
      >
        <h2
          id="runs-error-title"
          className="font-display text-[19px] font-bold tracking-[-0.3px] text-text-primary"
        >
          {terminal ? "This device can't sign in to its runs" : "Your runs didn't load"}
        </h2>
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          {error?.message ?? 'Something went wrong loading your runs.'}
        </p>
        {terminal ? (
          <p className="text-[13.5px] leading-[1.55] text-secondary">
            Retrying won&apos;t help here. Clearing this site&apos;s data starts a fresh log;
            the previous runs stay locked to the old sign-in.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => {
              setRetried(true);
              reloadRuns();
            }}
            className="mt-[6px] flex items-center justify-center rounded-[12px] bg-accent px-[22px] py-[11px] text-[14px] font-semibold text-white hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try again
          </button>
        )}
      </section>
    );
  }

  const storageWarning = sessionPersistenceDegraded()
    ? 'This browser is blocking site storage, so this tab will lose access to its runs when it closes. The runs themselves are saved.'
    : null;

  return (
    <RunsGateContext.Provider value={true}>
      {(notice || storageWarning) && (
        <div
          role="status"
          className="mx-5 mb-4 flex items-start justify-between gap-4 rounded-[12px] bg-warning-soft px-[18px] py-[12px] text-[13px] leading-[1.5] text-warning-text sm:mx-8 lg:mx-[40px]"
        >
          <span>
            {notice}
            {notice && storageWarning ? ' ' : ''}
            {storageWarning}
          </span>
          {notice && (
            <button
              type="button"
              onClick={clearRunsNotice}
              className="shrink-0 font-semibold underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
      {children}
    </RunsGateContext.Provider>
  );
}
