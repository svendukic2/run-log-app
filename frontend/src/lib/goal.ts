import { useSyncExternalStore } from 'react';

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

// Storage-backed hook, SSR-safe the same way useProfile is: the server
// snapshot is null and clients pick up the stored goal right after hydration.
// The goal is only written during onboarding, so `storage` alone is enough.
// All three callbacks live at module scope; a fresh getSnapshot closure per
// render would make React re-read the store on every render.
function subscribeToStorage(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
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
