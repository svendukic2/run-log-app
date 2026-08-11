'use client';

// The goal store (RUN-10 semantics, RUN-50 persistence). The onboarding
// goal and the per-week targets live in PostgreSQL behind /api/goal and
// /api/week-targets; this module caches the goal record plus the CURRENT
// week's target, which is the only week any card asks about. Pure helpers
// live in goalMath.ts and are re-exported here, so components import from
// '@/lib/goal' as always.
//
// What DIED with RUN-50: the client-side week resolution (DefaultGoal,
// AppliedGoal, resolveGoalTarget and their localStorage keys). The server's
// week snapshots replaced all of it - a week's target is materialized from
// the account's goal state on first use and frozen after (RUN-49,
// docs/data-model.md), so the client just reads the answer instead of
// re-deriving history rules. "Apply to weekly goal" is now a PUT on the
// current week; the Settings default is profile.defaultWeeklyGoalKm and
// SET-6 freezing happens server-side.
//
// CONTRACT this store leans on (backend snapshotKm, RUN-49): the server
// mints a new week's target from profile.defaultWeeklyGoalKm, else goal.km,
// else 20 - and GETting the current week ALWAYS materializes it for an
// authenticated account. Every migrated or onboarded account has a profile
// (with a default), so an account without a goal row still gets real server
// rows; fallbackSeedKm below mirrors the same order for the moments before
// the row is cached. The goal RECORD itself has no rendering consumer today:
// it is fetched as the seed's second tier, which matters exactly for an
// account in the repairable half-onboarded state (goal row landed, profile
// PUT failed) where it is the only number the server would mint from.
//
// Module-level mutable state is safe here for the same reason as in
// runs.ts: every write goes through publish() (touches window) and the
// server snapshot is the frozen initial object.
import { useEffect, useSyncExternalStore } from 'react';
import { fetchGoal, fetchWeekTarget, putWeekTarget, type WeekTarget } from './accountApi';
import { GOAL_DEFAULT_KM, todayIso, WEEK_TARGET_MAX_KM, type Goal } from './goalMath';
import { ACCOUNT_RECORDS_CHANGED_EVENT, getAccountGeneration, useProfile } from './onboarding';
import { startOfWeek } from './runMath';
import { ApiError, hasStoredSession } from './session';

export * from './goalMath';

/* Store -------------------------------------------------------------------- */

const GOAL_CHANGED_EVENT = 'runlog:goal-changed';

export type GoalStoreStatus = 'loading' | 'ready' | 'error';

export interface GoalStoreError {
  message: string;
  terminal: boolean;
}

interface GoalSnapshot {
  status: GoalStoreStatus;
  // null + 'ready' = no goal set yet (a fresh account, or none at all).
  // On 'error' both data fields keep their last good values.
  goal: Goal | null;
  // The current week's materialized target; null until fetched, or when the
  // device has no account (the fallback seed answers then).
  weekTarget: WeekTarget | null;
  error: GoalStoreError | null;
}

const INITIAL_SNAPSHOT: GoalSnapshot = Object.freeze({
  status: 'loading' as const,
  goal: null,
  weekTarget: null,
  error: null,
});

let snapshot: GoalSnapshot = INITIAL_SNAPSHOT;
let loadStarted = false;
let loadInFlight = false;
// A reload that arrived while one was in flight: run it after, never drop
// it - with the generation mechanism below, a dropped reload would leave
// the store stale until some later mount happened to notice. The queued
// run is always SILENT, which is safe today because a loud reload can only
// come from the boundary's retry button and the boundary never shows that
// button while a load is in flight (loading is checked before error). If a
// per-store retry ever exists, store the requested mode here too.
let reloadRequested = false;
// The account generation (onboarding.ts) this store last loaded under,
// captured BEFORE the fetches so a bump landing mid-flight stays visible
// as a mismatch. When onboarding finishes while nothing here is mounted,
// the next subscribe sees the mismatch and reloads - the
// ACCOUNT_RECORDS_CHANGED_EVENT alone would vanish into a window with no
// listeners. This is the only store that needs the generation: the profile
// store is primed directly by every bumper, and the runs store's data is
// only ever added to, never changed wholesale, by these events.
let loadedGeneration = 0;

function publish(next: GoalSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(GOAL_CHANGED_EVENT));
}

function toGoalError(error: unknown): GoalStoreError {
  if (error instanceof ApiError) {
    return { message: error.message, terminal: error.terminal };
  }
  return { message: 'Something went wrong loading your goal.', terminal: false };
}

// `silent` reloads keep the current snapshot on screen while fresh data is
// fetched, instead of bouncing the boundary through a spinner: they are
// used when the ACCOUNT's records changed (onboarding finished, settings
// saved) and the stale numbers on screen are the correct fallback seeds
// anyway. A silent FAILURE also stays off the error card - nobody asked
// for this fetch, the shown data is still the last good snapshot - it just
// marks the store stale so the next subscribe retries. The initial load
// and the boundary's retry stay loud on both counts.
async function loadGoalData(silent = false): Promise<void> {
  if (loadInFlight) {
    reloadRequested = true;
    return;
  }
  loadInFlight = true;
  loadedGeneration = getAccountGeneration();
  if (!silent) publish({ ...snapshot, status: 'loading', error: null });
  try {
    // Same lazy rule as the runs and profile stores: signed out means no
    // goal by definition, answered without the network.
    if (!hasStoredSession()) {
      publish({ status: 'ready', goal: null, weekTarget: null, error: null });
      return;
    }
    // Reading the current week is what materializes it server-side (the
    // RUN-49 snapshot rule) - this GET is the moment a fresh week gets its
    // target frozen.
    const [goal, weekTarget] = await Promise.all([
      fetchGoal(),
      fetchWeekTarget(startOfWeek(todayIso())),
    ]);
    publish({ status: 'ready', goal, weekTarget, error: null });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Loading the goal failed', error);
    }
    if (silent) {
      // Mark stale so the next subscribe retries; the last good snapshot
      // stays on screen.
      loadedGeneration = -1;
    } else {
      publish({
        status: 'error',
        goal: snapshot.goal,
        weekTarget: snapshot.weekTarget,
        error: toGoalError(error),
      });
    }
  } finally {
    loadInFlight = false;
    if (reloadRequested) {
      // A reload arrived mid-flight (a generation bump raced this load):
      // run it now rather than dropping it, or the store would stay stale
      // until some later mount noticed. Silent: whatever is on screen came
      // from this just-finished load.
      reloadRequested = false;
      void loadGoalData(true);
    }
  }
}

// The retry handle for the boundary's "Try again".
export function reloadGoal(): void {
  void loadGoalData();
}

function ensureLoaded(): void {
  if (!loadStarted) {
    loadStarted = true;
    void loadGoalData();
    return;
  }
  // Loaded, but under an older account generation: the records were
  // replaced while nothing here was mounted (the wizard finished). Reload
  // silently - the stale snapshot's fallback seeds are already the right
  // numbers, so no spinner is owed.
  if (loadedGeneration !== getAccountGeneration()) void loadGoalData(true);
}

function subscribeToGoal(onStoreChange: () => void): () => void {
  ensureLoaded();
  // For subscribers already MOUNTED when the account's records change; the
  // generation check in ensureLoaded covers everything else.
  const reload = () => {
    void loadGoalData(true);
  };
  window.addEventListener(GOAL_CHANGED_EVENT, onStoreChange);
  window.addEventListener(ACCOUNT_RECORDS_CHANGED_EVENT, reload);
  return () => {
    window.removeEventListener(GOAL_CHANGED_EVENT, onStoreChange);
    window.removeEventListener(ACCOUNT_RECORDS_CHANGED_EVENT, reload);
  };
}

export function useGoal(): Goal | null {
  return useSyncExternalStore(
    subscribeToGoal,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).goal;
}

export function useGoalStoreStatus(): GoalStoreStatus {
  return useSyncExternalStore(
    subscribeToGoal,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).status;
}

export function useGoalStoreError(): GoalStoreError | null {
  return useSyncExternalStore(
    subscribeToGoal,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).error;
}

/* The weekly target ----------------------------------------------------------- */

// A fresh week target may only merge into a cache that is 'ready';
// anything else reloads instead, so a stale error can never shadow fresh
// data and fresh data can never dress up an errored snapshot (the same
// rule as the runs store's mergeAfterMutation).
function mergeWeekTarget(weekTarget: WeekTarget): void {
  if (snapshot.status === 'ready') {
    publish({ status: 'ready', goal: snapshot.goal, weekTarget, error: null });
  } else {
    // Silent: the write that produced this target was user-initiated, and
    // flashing a spinner over the page that just took the click would make
    // a successful apply look like a failure.
    void loadGoalData(true);
  }
}

let weekRefreshInFlight = false;
// The week a refresh already ran for (successfully or not): without this,
// a week the server answers 404 for would re-trigger the effect's fetch on
// every render forever.
let refreshAttemptedWeek: string | null = null;

// Re-fetches the current week's target when the cached one is for another
// week (the page stayed open across a Monday midnight). Only the current
// week: the server 404s everything else by design. A real failure lands
// the store in 'error' - LOUDLY, unlike a silent reload's failure, because
// here the number on screen is last WEEK'S target dressed up as this
// week's; keeping it would be showing wrong data, not stale-but-right
// data. The boundary's retry is the recovery path.
async function refreshWeekTarget(weekStart: string): Promise<void> {
  if (weekRefreshInFlight || refreshAttemptedWeek === weekStart) return;
  if (!hasStoredSession() || weekStart !== startOfWeek(todayIso())) return;
  weekRefreshInFlight = true;
  refreshAttemptedWeek = weekStart;
  try {
    const weekTarget = await fetchWeekTarget(weekStart);
    // null cannot happen for the current week of a live account (the GET
    // materializes it); kept as a guard so a contract change surfaces as a
    // stale-looking number instead of a crash.
    if (weekTarget) mergeWeekTarget(weekTarget);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Refreshing the week target failed', error);
    }
    publish({
      status: 'error',
      goal: snapshot.goal,
      weekTarget: snapshot.weekTarget,
      error: toGoalError(error),
    });
    // Let the boundary's reload retry this week again.
    refreshAttemptedWeek = null;
  } finally {
    weekRefreshInFlight = false;
  }
}

// The weekly target the cards render (dashboard goal card, coach cards).
// The argument MUST be today (every consumer passes useToday()); it exists
// as a parameter because the ticking `today` is what re-renders the cards
// across a midnight week rollover. Until the week's row is cached the
// fallback seed answers: the same resolution the server mints from
// (profile default, else goal km, else 20 - backend snapshotKm), so the
// number on screen never changes when the row lands.
export function useGoalTarget(todayIsoDate: string): number {
  const current = useSyncExternalStore(
    subscribeToGoal,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );
  // Subscribed (not getProfileRecord()) so a settings save that changes
  // the default re-renders a card still showing the fallback seed.
  const profile = useProfile();
  const weekStart = startOfWeek(todayIsoDate);
  const matched = current.weekTarget?.weekStart === weekStart ? current.weekTarget : null;

  if (process.env.NODE_ENV !== 'production' && weekStart !== startOfWeek(todayIso())) {
    throw new Error(
      'useGoalTarget() was asked about a week other than the current one. It only ever answers for the running week (past weeks would get a fabricated number); pass useToday().',
    );
  }

  // In an effect, not in render: kicking a fetch during render is a side
  // effect React may replay arbitrarily.
  useEffect(() => {
    if (!matched && current.status === 'ready') void refreshWeekTarget(weekStart);
  }, [matched, current.status, weekStart]);

  return matched
    ? matched.targetKm
    : (profile?.defaultWeeklyGoalKm ?? current.goal?.km ?? GOAL_DEFAULT_KM);
}

// "Apply to weekly goal" on the coach's plan card (AIC-5, A15): the
// suggested target becomes this week's goal through the API. Async since
// RUN-50 and throws ApiError like every other write path, so the card
// shows the server's own message. Clamped to the same ceiling the server
// enforces; deliberately NOT clamped to the 0-60 slider - the coach can
// legitimately suggest more.
export async function applyGoalTarget(km: number): Promise<void> {
  if (!Number.isFinite(km) || km <= 0) {
    throw new ApiError('The suggested target is not a usable number.');
  }
  // Refused, not clamped: silently storing a different number than the one
  // the runner accepted, then confirming "applied", would be lying twice.
  if (km > WEEK_TARGET_MAX_KM) {
    throw new ApiError(`That weekly target is above the maximum of ${WEEK_TARGET_MAX_KM} km.`);
  }
  const weekTarget = await putWeekTarget(startOfWeek(todayIso()), Math.round(km));
  mergeWeekTarget(weekTarget);
}

/* Test hook --------------------------------------------------------------------- */

// Test-only: puts the module-level cache into a known state without a
// fetch (jest.setup.ts wires this up through src/test/runsApiMock.ts).
// Passing undefined re-arms the initial load.
export function __resetGoalStoreForTests(state?: {
  goal: Goal | null;
  weekTarget: WeekTarget | null;
}): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetGoalStoreForTests is not available in production');
  }
  loadInFlight = false;
  weekRefreshInFlight = false;
  refreshAttemptedWeek = null;
  loadedGeneration = 0;
  if (state === undefined) {
    loadStarted = false;
    snapshot = INITIAL_SNAPSHOT;
  } else {
    loadStarted = true;
    snapshot = { status: 'ready', goal: state.goal, weekTarget: state.weekTarget, error: null };
  }
}
