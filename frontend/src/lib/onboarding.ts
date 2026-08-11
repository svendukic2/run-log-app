'use client';

// The profile store (RUN-8 semantics, RUN-50 persistence). The profile
// lives in PostgreSQL behind GET/PUT /api/profile; this module holds an
// in-memory cache of it following the app-wide pattern decided in RUN-48
// (see docs/data-model.md, "The frontend API pattern"), so components keep
// reading synchronously through useProfile().
//
// "Onboarding complete" is no longer a stored flag: it is DERIVED - an
// account whose profile exists on the server has finished onboarding.
// CONTRACT this rests on: POST /api/auth/signup creates a User row and
// NOTHING else (RUN-56); the only writer of Profile rows is PUT
// /api/profile (RUN-49). A fresh signup therefore answers 404 on GET
// /api/profile and lands on the setup steps, exactly as it should. If
// signup ever starts creating profile rows, this derivation dies and a
// stored flag comes back.
//
// The profile holds the SETUP ANSWERS only since RUN-59 (running level and
// the default weekly goal). The runner's name and email live on the account
// (account.ts, GET/PUT /api/account) - the single source of truth every
// social surface already read from - so nothing here needs local identity
// data, which is what lets setup resume on any device after signing in.
//
// The wizard draft itself lives in onboardingDraft.ts (a leaf); this module
// owns the profile store and the onboarding actions. The one-time import of
// v1 localStorage data died with RUN-58: real sign-in replaced the device
// bridge, and a v1 device's minted account has no password its user could
// ever type, so there is no account to import into.
//
// Module-level mutable state is safe here for the same reason as in
// runs.ts: every write path goes through publish(), which touches `window`,
// and the useSyncExternalStore server snapshot is the frozen initial
// object, so SSR never reads the mutable value.
import { useSyncExternalStore } from 'react';
import {
  fetchProfile,
  putGoal,
  putProfile,
  RUNNING_LEVELS,
  type ProfileRecord,
  type RunningLevel,
} from './accountApi';
import { clampGoal } from './goalMath';
import {
  __resetOnboardingDraftForTests,
  clearOnboardingDraft,
  getOnboardingDraft,
  saveDraftGoal,
  type OnboardingDraft,
} from './onboardingDraft';
import { ROUTES } from './routes';
import { ApiError, hasStoredSession } from './session';

export { RUNNING_LEVELS, type ProfileRecord, type RunningLevel };
export { getOnboardingDraft, saveDraftGoal, type OnboardingDraft };

/* Store -------------------------------------------------------------------- */

const PROFILE_CHANGED_EVENT = 'runlog:profile-changed';

// Fired when the account's records were replaced wholesale outside the
// stores' own mutations (finishing onboarding), for stores that happen to
// be MOUNTED at that moment. Stores that are not mounted catch up through
// getAccountGeneration() below - an event alone would vanish into a window
// with no listeners.
export const ACCOUNT_RECORDS_CHANGED_EVENT = 'runlog:account-records-changed';

// Bumped whenever the account's records change wholesale. The goal store
// compares this against the generation it loaded under and reloads on the
// next subscribe when stale, which covers the wizard-to-dashboard
// navigation where nothing was mounted when the event fired.
let accountGeneration = 0;

export function getAccountGeneration(): number {
  return accountGeneration;
}

export type ProfileStatus = 'loading' | 'ready' | 'error';

export interface ProfileError {
  message: string;
  terminal: boolean;
}

interface ProfileSnapshot {
  status: ProfileStatus;
  // null + 'ready' = this account has not finished onboarding (the server
  // answered 404), which is a routing state, not an error. On 'error' this
  // keeps the last good record, so the sidebar footer (which reads softly,
  // outside any boundary) does not go blank on a transient reload failure.
  profile: ProfileRecord | null;
  error: ProfileError | null;
}

const INITIAL_SNAPSHOT: ProfileSnapshot = Object.freeze({
  status: 'loading' as const,
  profile: null,
  error: null,
});

let snapshot: ProfileSnapshot = INITIAL_SNAPSHOT;
let loadStarted = false;
let loadInFlight = false;

function publish(next: ProfileSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
}

function toProfileError(error: unknown): ProfileError {
  if (error instanceof ApiError) {
    return { message: error.message, terminal: error.terminal };
  }
  return { message: 'Something went wrong loading your profile.', terminal: false };
}

async function loadProfile(): Promise<void> {
  if (loadInFlight) return;
  loadInFlight = true;
  publish({ status: 'loading', profile: snapshot.profile, error: null });
  try {
    // Same lazy rule as the runs store: signed out means no profile by
    // definition, and answering without the network keeps the sign-in
    // screen from firing doomed requests.
    if (!hasStoredSession()) {
      publish({ status: 'ready', profile: null, error: null });
      return;
    }
    const profile = await fetchProfile();
    publish({ status: 'ready', profile, error: null });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Loading the profile failed', error);
    }
    publish({ status: 'error', profile: snapshot.profile, error: toProfileError(error) });
  } finally {
    loadInFlight = false;
  }
}

// The retry handle for the boundary's "Try again".
export function reloadProfile(): void {
  void loadProfile();
}

function ensureLoaded(): void {
  if (loadStarted) return;
  loadStarted = true;
  void loadProfile();
}

function subscribeToProfile(onStoreChange: () => void): () => void {
  ensureLoaded();
  window.addEventListener(PROFILE_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(PROFILE_CHANGED_EVENT, onStoreChange);
  };
}

// The cached record, synchronously, for non-React callers (the goal store's
// seed fallback). null while loading, errored-without-history or not
// onboarded.
export function getProfileRecord(): ProfileRecord | null {
  return snapshot.profile;
}

// Deliberately SOFT (returns null while loading) unlike useRuns' dev-mode
// throw: the sidebar footer reads this outside any boundary and hiding the
// footer until the profile arrives is correct there, not a bug to catch.
export function useProfile(): ProfileRecord | null {
  return useSyncExternalStore(
    subscribeToProfile,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).profile;
}

export function useProfileStatus(): ProfileStatus {
  return useSyncExternalStore(
    subscribeToProfile,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).status;
}

export function useProfileError(): ProfileError | null {
  return useSyncExternalStore(
    subscribeToProfile,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).error;
}

/* Onboarding actions --------------------------------------------------------- */

// "Finish setup" (RUN-11): the moment the wizard's answers become the
// account's records. Since RUN-59 the ONLY thing it needs from local state
// is the drafted goal - name and email already live on the account from
// signup - which is exactly what makes setup resumable after signing in on
// another device (AC3). Goal first, then the profile (whose
// defaultWeeklyGoalKm starts as the goal km - the Settings stepper edits it
// from there, SET-3); the draft dies only after both landed, so a failed
// finish keeps the answers and the button retries. A failure between the two
// PUTs leaves a goal row on an account with no profile, which the landing
// route correctly treats as unfinished and the retried finish repairs
// (full-replace PUTs).
export async function finishOnboarding(level: RunningLevel): Promise<void> {
  const draft = getOnboardingDraft();
  // Nothing is fabricated. The goal step always drafts a goal (Skip drafts
  // the 20 km default explicitly), so a missing one means this screen was
  // reached out of order.
  if (!draft.goal) {
    throw new ApiError('Your weekly goal from the first step is missing. Go back a step.');
  }
  const goal = draft.goal;
  await putGoal(goal);
  const profile = await putProfile({
    runningLevel: level,
    defaultWeeklyGoalKm: goal.km,
  });
  clearOnboardingDraft();
  accountGeneration += 1;
  publish({ status: 'ready', profile, error: null });
  window.dispatchEvent(new Event(ACCOUNT_RECORDS_CHANGED_EVENT));
}

// The Settings save for the SETUP half (RUN-37/38/39, narrowed by RUN-59):
// the default weekly goal. Name and email are the account's and go through
// saveAccountDetails (account.ts). The running level is not editable after
// onboarding (by design, flagged on RUN-11), so the stored one rides along -
// and because a full replace with a guessed level would silently rewrite
// data, a missing record is a hard error, not a default. (The Settings form
// mounts behind the boundary, so the record is loaded; this throw is the
// enforcement of that assumption, not a code path.) SET-6 (a changed default
// leaves the running week's target alone) is enforced by the SERVER, which
// freezes the current week before the new default lands.
export async function saveWeeklyDefault(defaultWeeklyGoalKm: number): Promise<void> {
  const current = snapshot.profile;
  if (!current) {
    throw new ApiError('Your profile has not loaded yet. Reload the page and try again.');
  }
  const profile = await putProfile({
    defaultWeeklyGoalKm: clampGoal(defaultWeeklyGoalKm),
    runningLevel: current.runningLevel,
  });
  publish({ status: 'ready', profile, error: null });
  // WHY the goal store must reload after a settings save: the SET-6 freeze
  // MATERIALIZES the current week server-side during the PUT. A card whose
  // cached weekTarget is still null shows the fallback seed, which after
  // this publish would be the NEW default - but the week's real, frozen
  // target is the OLD one. The reload fetches the frozen row so the number
  // on screen is the server's, not a guess that just changed under it.
  // Silent for mounted subscribers (event), next-subscribe for the rest
  // (generation).
  accountGeneration += 1;
  window.dispatchEvent(new Event(ACCOUNT_RECORDS_CHANGED_EVENT));
}

/* Landing route -------------------------------------------------------------- */

// Where a visitor belongs when the app opens (RUN-13 AC1, reshaped by
// RUN-58): Sign in when signed out, the Dashboard once onboarding is
// finished (= the profile exists on the server), and the goal setup step
// for a signed-in account that has not finished. Only known once the
// profile store settles; callers render nothing while this is null. For a
// signed-out visitor the answer is synchronous - the store settles
// ready-and-empty without the network.
export function useLandingRoute(): string | null {
  const current = useSyncExternalStore(
    subscribeToProfile,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );
  if (current.status !== 'ready') return null;
  if (!hasStoredSession()) return ROUTES.signIn;
  return current.profile ? ROUTES.dashboard : ROUTES.setupGoal;
}

/* Test hook -------------------------------------------------------------------- */

// Test-only: puts the module-level cache into a known state without a
// fetch (jest.setup.ts wires this up through src/test/runsApiMock.ts).
// Passing undefined re-arms the initial load; a record or null primes
// 'ready'. Also clears the draft's memory copy, which outlives the per-test
// localStorage wipe.
export function __resetProfileStoreForTests(profile?: ProfileRecord | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetProfileStoreForTests is not available in production');
  }
  __resetOnboardingDraftForTests();
  loadInFlight = false;
  accountGeneration = 0;
  if (profile === undefined) {
    loadStarted = false;
    snapshot = INITIAL_SNAPSHOT;
  } else {
    loadStarted = true;
    snapshot = { status: 'ready', profile, error: null };
  }
}
