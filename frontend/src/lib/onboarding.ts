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
// /api/profile (RUN-49). A device that minted its account through the runs
// import therefore still answers 404 on GET /api/profile and lands on the
// onboarding wizard, exactly as it should. If signup ever starts creating
// profile rows, this derivation dies and a stored flag comes back.
//
// The wizard draft itself lives in onboardingDraft.ts (a leaf, shared with
// session.ts); this module owns the profile store, the onboarding actions
// and the one-time import of v1 localStorage data into the account.
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
  putWeekTarget,
  RUNNING_LEVELS,
  type ProfileRecord,
  type RunningLevel,
} from './accountApi';
import {
  clampGoal,
  GOAL_DEFAULT_KM,
  isRealIsoDay,
  todayIso,
  WEEK_TARGET_MAX_KM,
  type Goal,
} from './goalMath';
import {
  __resetOnboardingDraftForTests,
  clearOnboardingDraft,
  getOnboardingDraft,
  readLegacyProfile,
  saveDraftGoal,
  saveDraftProfile,
  writeOnboardingDraft,
  type OnboardingDraft,
  type Profile,
} from './onboardingDraft';
import { validateProfileForm } from './profileValidation';
import { ROUTES } from './routes';
import { startOfWeek } from './runMath';
import { ApiError, hasStoredSession } from './session';

export { RUNNING_LEVELS, type ProfileRecord, type RunningLevel };
export { getOnboardingDraft, saveDraftGoal, saveDraftProfile, type OnboardingDraft, type Profile };

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
    // Same lazy rule as the runs store: a device with no account and no v1
    // data has no profile by definition, and answering without the network
    // is what keeps a page view from ever minting a server account.
    if (!hasStoredSession() && !hasLegacyOnboardingData()) {
      publish({ status: 'ready', profile: null, error: null });
      return;
    }
    await ensureLegacyImport();
    // The import may have moved a half-finished v1 wizard into the draft
    // instead of creating an account; without a session there is nothing
    // to fetch.
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

/* One-time import of v1 localStorage data (RUN-50) -------------------------- */

// The pre-RUN-50 keys. Data under them belongs to a real v1 user and must
// not silently vanish; it is written to the account once, then the keys are
// deleted. runlog.defaultGoal and runlog.appliedGoal fold into the profile
// default and the current week's target - their client-side resolution
// logic (RUN-33/38) is gone, the server's week snapshots replaced it.
const LEGACY_PROFILE_KEY = 'runlog.profile';
const LEGACY_COMPLETE_KEY = 'runlog.onboardingComplete';
const LEGACY_LEVEL_KEY = 'runlog.level';
const LEGACY_GOAL_KEY = 'runlog.goal';
const LEGACY_DEFAULT_GOAL_KEY = 'runlog.defaultGoal';
const LEGACY_APPLIED_GOAL_KEY = 'runlog.appliedGoal';

const LEGACY_KEYS = [
  LEGACY_PROFILE_KEY,
  LEGACY_COMPLETE_KEY,
  LEGACY_LEVEL_KEY,
  LEGACY_GOAL_KEY,
  LEGACY_DEFAULT_GOAL_KEY,
  LEGACY_APPLIED_GOAL_KEY,
];

export function hasLegacyOnboardingData(): boolean {
  try {
    return LEGACY_KEYS.some((key) => window.localStorage.getItem(key) !== null);
  } catch {
    return false;
  }
}

// A legacy goal is imported as a record ONLY when it is fully valid: the
// km within bounds and real calendar days. Anything less and no goal row
// is created - the km is still salvaged into the profile default (below),
// but dates are never fabricated: a made-up start date would be displayed
// as if the user chose it.
function readLegacyGoal(): Goal | null {
  const km = readLegacyGoalKm();
  if (km === null) return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_GOAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Goal;
    if (typeof parsed.startDate !== 'string' || !isRealIsoDay(parsed.startDate)) return null;
    const endDate =
      typeof parsed.endDate === 'string' &&
      isRealIsoDay(parsed.endDate) &&
      parsed.endDate >= parsed.startDate
        ? parsed.endDate
        : null;
    return { km, startDate: parsed.startDate, endDate };
  } catch {
    return null;
  }
}

// The km alone, for salvaging into the profile default when the record as
// a whole is not importable.
function readLegacyGoalKm(): number | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_GOAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { km: number };
    if (typeof parsed?.km !== 'number' || !Number.isFinite(parsed.km) || parsed.km <= 0) {
      return null;
    }
    return clampGoal(Math.round(parsed.km));
  } catch {
    return null;
  }
}

function readLegacyLevel(): RunningLevel {
  try {
    const raw = window.localStorage.getItem(LEGACY_LEVEL_KEY);
    const capitalized = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
    return (RUNNING_LEVELS as readonly string[]).includes(capitalized)
      ? (capitalized as RunningLevel)
      : 'Beginner';
  } catch {
    return 'Beginner';
  }
}

function readLegacyDefaultGoalKm(): number | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_DEFAULT_GOAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { km: number };
    if (typeof parsed?.km !== 'number' || !Number.isFinite(parsed.km)) return null;
    return clampGoal(Math.round(parsed.km));
  } catch {
    return null;
  }
}

function readLegacyAppliedGoal(): { km: number; weekStart: string } | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_APPLIED_GOAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { km: number; weekStart: string };
    if (
      typeof parsed?.km !== 'number' ||
      !Number.isFinite(parsed.km) ||
      parsed.km <= 0 ||
      typeof parsed.weekStart !== 'string' ||
      !isRealIsoDay(parsed.weekStart)
    ) {
      return null;
    }
    return {
      km: Math.min(Math.round(parsed.km), WEEK_TARGET_MAX_KM),
      weekStart: startOfWeek(parsed.weekStart),
    };
  } catch {
    return null;
  }
}

function removeLegacyKeys(): void {
  try {
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Blocked storage: the keys will re-run the (idempotent) import on the
    // next load, which finds the profile already on the server.
  }
}

// Moves not-importable v1 data into the wizard draft. The legacy keys are
// deleted ONLY when the draft write was durable: with blocked storage the
// draft exists in memory alone, and deleting the source of truth would
// turn the next reload into data loss - better to leave the keys and let
// the import salvage again.
function salvageIntoDraft(profile: Profile | null, goal: Goal | null): void {
  const draft: OnboardingDraft = { ...getOnboardingDraft() };
  if (profile) draft.profile = profile;
  if (goal) draft.goal = goal;
  const durable = writeOnboardingDraft(draft);
  if (durable) removeLegacyKeys();
}

let legacyImport: Promise<void> | null = null;

// Both stores (profile here, goal in goal.ts) await this before their first
// fetch, so neither can read the server around the import and cache a
// pre-import 404. Single-flight; a failed import re-arms so the boundary's
// "Try again" resumes it. Keys are deleted only after every write landed,
// so a failure halfway resumes idempotently: the PUTs are full replaces.
export function ensureLegacyImport(): Promise<void> {
  if (!legacyImport) {
    legacyImport = runLegacyImport().catch((error: unknown) => {
      legacyImport = null;
      throw error;
    });
  }
  return legacyImport;
}

async function runLegacyImport(): Promise<void> {
  if (typeof window === 'undefined') return;
  const legacyProfile = readLegacyProfile();
  const complete = (() => {
    try {
      return window.localStorage.getItem(LEGACY_COMPLETE_KEY) === 'true';
    } catch {
      return false;
    }
  })();

  if (!legacyProfile) {
    // No profile means v1 never got past the first wizard step; a stray
    // goal alone cannot complete onboarding. Salvage it into the draft so
    // the wizard prefills, then clear the residue.
    if (hasLegacyOnboardingData()) {
      salvageIntoDraft(null, readLegacyGoal());
    }
    return;
  }

  // The v1 forms validated names and email (WEL-5); hand-edited storage may
  // not pass anymore. Invalid or half-finished onboarding both land in the
  // wizard draft: the visitor finishes (prefilled, and the landing route
  // sends them through the Welcome form where invalid fields are editable)
  // instead of the import wedging on a 400 or fabricating an account from
  // junk.
  const profileValid = Object.keys(validateProfileForm(legacyProfile)).length === 0;
  if (!complete || !profileValid) {
    salvageIntoDraft(legacyProfile, readLegacyGoal());
    return;
  }

  // A completed v1 onboarding becomes the account's records. The goal PUT
  // goes first so the profile PUT (which is the "onboarding complete"
  // marker - see the module header) lands last: a failure in between
  // leaves an account with a goal row and no profile, which the landing
  // route correctly treats as unfinished and the resumed import repairs
  // (both PUTs are idempotent full replaces). The applied goal, if it is
  // for the running week, becomes that week's target - past applications
  // are history the server has no row for, and fabricating one is exactly
  // what RUN-49 refuses to do.
  const goal = readLegacyGoal();
  if (goal) await putGoal(goal);
  await putProfile({
    ...legacyProfile,
    runningLevel: readLegacyLevel(),
    defaultWeeklyGoalKm:
      readLegacyDefaultGoalKm() ?? goal?.km ?? readLegacyGoalKm() ?? GOAL_DEFAULT_KM,
  });
  const applied = readLegacyAppliedGoal();
  if (applied && applied.weekStart === startOfWeek(todayIso())) {
    await putWeekTarget(applied.weekStart, applied.km);
  }
  accountGeneration += 1;
  removeLegacyKeys();
}

/* Onboarding actions --------------------------------------------------------- */

// "Finish setup" (RUN-11): the moment the wizard's answers become an
// account. The draft is validated LOCALLY first - a bad draft (hand-edited,
// or salvaged from invalid v1 data) must fail before it burns a round trip,
// and the landing route sends its owner back through the Welcome form where
// the fields are editable. Goal first, then the profile (whose
// defaultWeeklyGoalKm starts as the goal km - the Settings stepper edits it
// from there, SET-3); the draft dies only after both landed, so a failed
// finish keeps every answer and the button retries. A failure between the
// two PUTs leaves a goal row on an account with no profile: "abandoned
// wizard costs nothing server-side" holds up to that one already-minted
// account, and the retry repairs it (full-replace PUTs). This is also the
// moment the device account is minted (session.ts signs up lazily on the
// first apiFetch).
export async function finishOnboarding(level: RunningLevel): Promise<void> {
  const draft = getOnboardingDraft();
  if (!draft.profile || Object.keys(validateProfileForm(draft.profile)).length > 0) {
    throw new ApiError(
      'Your details from the first step are missing or incomplete. Start from the beginning.',
    );
  }
  // Same principle as the profile half and the legacy import: nothing is
  // fabricated. The goal step always drafts a goal (Skip drafts the 20 km
  // default explicitly), so a missing one means this screen was reached
  // out of order.
  if (!draft.goal) {
    throw new ApiError('Your weekly goal from the second step is missing. Go back a step.');
  }
  const goal = draft.goal;
  await putGoal(goal);
  const profile = await putProfile({
    ...draft.profile,
    runningLevel: level,
    defaultWeeklyGoalKm: goal.km,
  });
  clearOnboardingDraft();
  accountGeneration += 1;
  publish({ status: 'ready', profile, error: null });
  window.dispatchEvent(new Event(ACCOUNT_RECORDS_CHANGED_EVENT));
}

// The Settings save (RUN-37/38/39): names, email and the default weekly
// goal in one full-replace PUT. The running level is not editable after
// onboarding (by design, flagged on RUN-11), so the stored one rides
// along - and because a full replace with a guessed level would silently
// rewrite data, a missing record is a hard error, not a default. (The
// Settings form mounts behind the boundary, so the record is loaded; this
// throw is the enforcement of that assumption, not a code path.) SET-6 (a
// changed default leaves the running week's target alone) is enforced by
// the SERVER, which freezes the current week before the new default lands.
export async function saveProfileSettings(
  update: Profile & { defaultWeeklyGoalKm: number },
): Promise<void> {
  const current = snapshot.profile;
  if (!current) {
    throw new ApiError('Your profile has not loaded yet. Reload the page and try again.');
  }
  const profile = await putProfile({
    ...update,
    defaultWeeklyGoalKm: clampGoal(update.defaultWeeklyGoalKm),
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

// Where a visitor belongs when the app opens (RUN-13 AC1): the Dashboard
// once onboarding is finished (= the profile exists on the server), the
// goal step when the draft holds a VALID first step (an invalid one -
// hand-edited or salvaged from broken v1 data - must go back through the
// Welcome form, the only screen where those fields are editable; skipping
// it would dead-end at a "Finish setup" that can never pass), and the
// Welcome screen otherwise. Only known once the profile store settles;
// callers render nothing while this is null.
export function useLandingRoute(): string | null {
  const current = useSyncExternalStore(
    subscribeToProfile,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );
  if (current.status !== 'ready') return null;
  if (current.profile) return ROUTES.dashboard;
  const draft = getOnboardingDraft().profile;
  const draftValid = draft && Object.keys(validateProfileForm(draft)).length === 0;
  return draftValid ? ROUTES.setupGoal : ROUTES.welcome;
}

/* Display helpers (RUN-14) ---------------------------------------------------- */

// There is no avatar upload, so the "avatar" is always the derived initials.
function firstGrapheme(value: string): string {
  // Spread instead of [0] so surrogate pairs ("Đurđa", emoji) stay intact.
  return [...value.trim()][0] ?? '';
}

export function profileInitials(profile: Profile): string {
  return (firstGrapheme(profile.firstName) + firstGrapheme(profile.lastName)).toUpperCase();
}

// "Marko Kovačić" renders as "Marko K." per the Figma footer (node 47:39).
export function profileShortName(profile: Profile): string {
  const lastInitial = firstGrapheme(profile.lastName);
  const firstName = profile.firstName.trim();
  return lastInitial ? `${firstName} ${lastInitial.toUpperCase()}.` : firstName;
}

/* Test hook -------------------------------------------------------------------- */

// Test-only: puts the module-level cache into a known state without a
// fetch (jest.setup.ts wires this up through src/test/runsApiMock.ts).
// Passing undefined re-arms the initial load; a record or null primes
// 'ready'. Also clears the draft's memory copy and the import single-flight,
// which outlive the per-test localStorage wipe.
export function __resetProfileStoreForTests(profile?: ProfileRecord | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetProfileStoreForTests is not available in production');
  }
  __resetOnboardingDraftForTests();
  legacyImport = null;
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
