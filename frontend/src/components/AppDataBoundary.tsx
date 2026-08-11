'use client';

import { useEffect, useState } from 'react';
import { reloadAccount, useAccountError, useAccountStatus } from '@/lib/account';
import { useHydrated } from '@/lib/useHydrated';
import { reloadGoal, useGoalStoreError, useGoalStoreStatus } from '@/lib/goal';
import { reloadProfile, useProfileError, useProfileStatus } from '@/lib/onboarding';
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
      <p className="text-[13.5px] text-secondary">Loading your data…</p>
    </div>
  );
}

// The screen-level gate of the app-wide async pattern (RUN-48, widened in
// RUN-50): every page that derives its UI from the API-backed stores (runs,
// profile, goal) renders through this boundary, so loading and error
// handling is decided once instead of per card. Mounting it is also what
// triggers each store's lazy initial load.
//
// Loading renders nothing for the first quarter second (extending the
// useHydrated idiom), then an honest spinner; the request timeout in
// session.ts guarantees it cannot spin forever. Errors get one card in two
// shapes: retryable failures (network, timeout, 5xx) carry a Try again;
// terminal ones (this device's identity cannot authenticate) explain the
// way out instead of offering a button that fails identically forever.
// Children render only when every store is 'ready', and they learn that
// through RunsGateContext, which useRuns() uses to fail loudly on ungated
// screens.
export default function AppDataBoundary({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const runsStatus = useRunsStatus();
  const accountStatus = useAccountStatus();
  const profileStatus = useProfileStatus();
  const goalStatus = useGoalStoreStatus();
  const runsError = useRunsError();
  const accountError = useAccountError();
  const profileError = useProfileError();
  const goalError = useGoalStoreError();
  const notice = useRunsNotice();
  const [retried, setRetried] = useState(false);

  const statuses = [runsStatus, accountStatus, profileStatus, goalStatus];
  // One card, one message - but a TERMINAL error always outranks a
  // transient one: showing "Try again" because the runs load happened to
  // fail first, while the profile is terminally unable to authenticate,
  // would loop the user through retries that can never end well.
  const errors = [runsError, accountError, profileError, goalError].filter(
    (candidate): candidate is NonNullable<typeof candidate> => candidate !== null,
  );
  const error = errors.find((candidate) => candidate.terminal) ?? errors[0] ?? null;

  if (!hydrated || statuses.includes('loading')) {
    return <LoadingNotice immediate={retried} />;
  }

  if (statuses.includes('error')) {
    const terminal = error?.terminal ?? false;
    return (
      <section
        role="alert"
        aria-labelledby="app-data-error-title"
        className="mx-5 mb-6 flex flex-col items-start gap-[10px] rounded-[18px] border border-line bg-white p-[28px] sm:mx-8 lg:mx-[40px]"
      >
        <h2
          id="app-data-error-title"
          className="font-display text-[19px] font-bold tracking-[-0.3px] text-text-primary"
        >
          {terminal ? 'Your session has ended' : "Your data didn't load"}
        </h2>
        <p className="text-[13.5px] leading-[1.55] text-secondary">
          {error?.message ?? 'Something went wrong loading your data.'}
        </p>
        {terminal ? (
          // The only terminal error since RUN-58 is an expired/invalid
          // session, and the session layer is already navigating to Sign in
          // when it throws one - this card can flash for the moment that
          // navigation takes, so it narrates it instead of offering advice.
          <p className="text-[13.5px] leading-[1.55] text-secondary">
            Taking you to Sign in. Your data is saved and will be there when you sign back in.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => {
              setRetried(true);
              // Only the failed stores actually refetch: reload on a store
              // that is already 'ready' or mid-flight coalesces.
              if (runsStatus === 'error') reloadRuns();
              if (accountStatus === 'error') reloadAccount();
              if (profileStatus === 'error') reloadProfile();
              if (goalStatus === 'error') reloadGoal();
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
    ? 'This browser is blocking site storage, so this tab will lose access to its data when it closes. The data itself is saved.'
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
