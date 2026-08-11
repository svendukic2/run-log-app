// Pure goal helpers: types, bounds and formatters with no storage and no
// network, safe to import from anywhere (the same split runMath.ts is to
// runs.ts). goal.ts re-exports everything here, so components keep
// importing from '@/lib/goal' as always; this module exists so modules
// below goal.ts in the import graph (onboarding.ts, accountApi.ts) can
// share the types without a cycle.

// Weekly goal range shown on the slider scale (0 / 30 / 60 km). Mirrored by
// the API's validation bounds (backend src/common/weekly-goal.ts).
export const GOAL_MIN_KM = 0;
export const GOAL_MAX_KM = 60;
export const GOAL_DEFAULT_KM = 20;

export function clampGoal(value: number): number {
  return Math.min(GOAL_MAX_KM, Math.max(GOAL_MIN_KM, value));
}

// The weekly goal record. Dates are local-time ISO day strings (yyyy-mm-dd)
// so they compare chronologically as plain strings; endDate null = "No end
// date". Exactly the GET/PUT /api/goal contract (docs/data-model.md).
export interface Goal {
  km: number;
  startDate: string;
  endDate: string | null;
}

// The ceiling for an applied week target, mirroring the API's bound
// (backend WEEK_TARGET_MAX_KM): deliberately above the 60 km slider cap
// because the coach can suggest more than the sliders offer, but never
// unbounded - the server 400s past this.
export const WEEK_TARGET_MAX_KM = 1000;

// Shape only: 9999-99-99 passes. Use isRealIsoDay when validity matters.
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// A string naming a real calendar day: right shape AND survives a UTC
// round-trip (2026-02-31 silently rolls into March and fails the
// comparison).
export function isRealIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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
