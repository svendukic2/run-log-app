import { useSyncExternalStore } from 'react';
import { fromIsoDate, startOfWeek, toIsoDate } from './runs';

// Weekly goal range shown on the slider scale (0 / 30 / 60 km).
export const GOAL_MIN_KM = 0;
export const GOAL_MAX_KM = 60;
export const GOAL_DEFAULT_KM = 20;

export function clampGoal(value: number): number {
  return Math.min(GOAL_MAX_KM, Math.max(GOAL_MIN_KM, value));
}

// Stored weekly goal. Dates are local-time ISO day strings (yyyy-mm-dd) so
// they compare chronologically as plain strings; endDate null = "No end date".
export interface Goal {
  km: number;
  startDate: string;
  endDate: string | null;
}

const GOAL_KEY = 'runlog.goal';

export function getGoal(): Goal | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(GOAL_KEY);
    return raw ? (JSON.parse(raw) as Goal) : null;
  } catch {
    return null;
  }
}

// No same-tab announcement here, unlike saveDefaultGoal: the onboarding flow
// navigates away on save, so nothing in this tab is watching yet.
export function saveGoal(goal: Goal): void {
  window.localStorage.setItem(GOAL_KEY, JSON.stringify(goal));
}

// localStorage is user-writable, so km is verified before consumers do
// arithmetic with it: a string would crash `.toFixed()`, and 0 or a negative
// would render "14 / 0 km". Anything malformed reads as "no goal".
function parseGoal(raw: string): Goal | null {
  try {
    const parsed = JSON.parse(raw) as Goal;
    if (typeof parsed?.km !== 'number' || !Number.isFinite(parsed.km) || parsed.km <= 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// `storage` only fires in *other* tabs, so Settings saves of the default goal
// announce themselves in this one too - the same pattern runs.ts and
// onboarding.ts use (RUN-38).
const GOAL_CHANGED_EVENT = 'runlog:goal-changed';

// Storage-backed hook, SSR-safe the same way useProfile is: the server
// snapshot is null and clients pick up the stored goal right after hydration.
// All the callbacks live at module scope; a fresh getSnapshot closure per
// render would make React re-read the store on every render.
function subscribeToStorage(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(GOAL_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(GOAL_CHANGED_EVENT, onStoreChange);
  };
}

function getGoalSnapshot(): string | null {
  return window.localStorage.getItem(GOAL_KEY);
}

function getServerSnapshot(): null {
  return null;
}

export function useGoal(): Goal | null {
  const raw = useSyncExternalStore(subscribeToStorage, getGoalSnapshot, getServerSnapshot);
  return raw ? parseGoal(raw) : null;
}

export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-07-14" -> "Tue, 14 Jul 2026", the date format the design shows.
export function formatGoalDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/* Default weekly goal (RUN-38) ---------------------------------------------- */

// The Settings default seeds each *new* week and leaves the running week
// alone (SET-6): `km` applies from `effectiveFromWeek` (an ISO Monday) on,
// and `previousKm` freezes the target the week of the save already had, so
// saving - or re-saving - can never retroactively move it.
export interface DefaultGoal {
  km: number;
  effectiveFromWeek: string;
  previousKm: number;
}

const DEFAULT_GOAL_KEY = 'runlog.defaultGoal';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// localStorage is user-writable, so both km fields are verified as finite
// numbers before consumers do arithmetic with them. Unlike the onboarding
// goal, 0 is legal here: the stepper's bounds are 0-60 (A17). Out-of-range
// values clamp and a hand-edited mid-week date snaps back to its Monday,
// instead of reading as "no default".
function parseDefaultGoal(raw: string): DefaultGoal | null {
  try {
    const parsed = JSON.parse(raw) as DefaultGoal;
    if (
      typeof parsed?.km !== 'number' ||
      !Number.isFinite(parsed.km) ||
      typeof parsed.previousKm !== 'number' ||
      !Number.isFinite(parsed.previousKm) ||
      typeof parsed.effectiveFromWeek !== 'string' ||
      !ISO_DAY.test(parsed.effectiveFromWeek)
    ) {
      return null;
    }
    return {
      km: clampGoal(parsed.km),
      effectiveFromWeek: startOfWeek(parsed.effectiveFromWeek),
      previousKm: clampGoal(parsed.previousKm),
    };
  } catch {
    return null;
  }
}

export function getDefaultGoal(): DefaultGoal | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(DEFAULT_GOAL_KEY);
  return raw ? parseDefaultGoal(raw) : null;
}

// The onboarding goal through the same validation useGoal applies, so the
// default-goal logic never does arithmetic with a malformed stored km.
function getValidGoal(): Goal | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(GOAL_KEY);
  return raw ? parseGoal(raw) : null;
}

// ISO Monday of the week after the one `isoDate` falls in: the first week a
// freshly saved default applies to.
export function nextWeekStart(isoDate: string): string {
  const monday = fromIsoDate(startOfWeek(isoDate));
  monday.setDate(monday.getDate() + 7);
  return toIsoDate(monday);
}

// The goal target for the week `isoDate` falls in. With no saved default the
// onboarding goal (or the 20 km fallback) applies to every week; once one is
// saved, weeks from its Monday on use it and earlier weeks keep the frozen
// previous target. ISO day strings compare chronologically as plain strings.
// Only two levels of history exist, so this is valid for the current week
// onward; asking about weeks before the latest save would get that save's
// frozen target, not what those weeks actually showed at the time.
export function resolveGoalTarget(
  goal: Goal | null,
  defaultGoal: DefaultGoal | null,
  isoDate: string,
): number {
  if (!defaultGoal) return goal?.km ?? GOAL_DEFAULT_KM;
  return startOfWeek(isoDate) >= defaultGoal.effectiveFromWeek
    ? defaultGoal.km
    : defaultGoal.previousKm;
}

// What the Settings stepper shows: the latest saved default - even one not
// effective yet - else the onboarding goal, else the 20 km fallback.
export function getDefaultGoalKm(): number {
  return getDefaultGoal()?.km ?? getValidGoal()?.km ?? GOAL_DEFAULT_KM;
}

// Saving records the *next* Monday as the first week the new default applies
// to and freezes the current week's target as previousKm, so "applied to each
// new week" is literal: the running week keeps the target it started with
// (AC4) and every later week starts from the new default (AC3). Freezing the
// *resolved* current target also makes re-saving safe: a default that already
// took effect stays this week's target instead of falling back to the
// onboarding goal.
export function saveDefaultGoal(km: number, today: string = todayIso()): void {
  const defaultGoal: DefaultGoal = {
    km: clampGoal(km),
    effectiveFromWeek: nextWeekStart(today),
    previousKm: resolveGoalTarget(getValidGoal(), getDefaultGoal(), today),
  };
  window.localStorage.setItem(DEFAULT_GOAL_KEY, JSON.stringify(defaultGoal));
  window.dispatchEvent(new Event(GOAL_CHANGED_EVENT));
}

function getDefaultGoalSnapshot(): string | null {
  return window.localStorage.getItem(DEFAULT_GOAL_KEY);
}

// The weekly target the cards render (dashboard goal card, coach cards):
// storage-backed like useGoal and resolved per week, so a freshly saved
// default only shows up once its week arrives. SSR-safe the same way: both
// server snapshots are null, which resolves to the 20 km fallback.
export function useGoalTarget(isoDate: string): number {
  const rawGoal = useSyncExternalStore(subscribeToStorage, getGoalSnapshot, getServerSnapshot);
  const rawDefault = useSyncExternalStore(
    subscribeToStorage,
    getDefaultGoalSnapshot,
    getServerSnapshot,
  );
  return resolveGoalTarget(
    rawGoal ? parseGoal(rawGoal) : null,
    rawDefault ? parseDefaultGoal(rawDefault) : null,
    isoDate,
  );
}
