// Calendar-day plumbing shared by every module that stores a DATE column
// (runs, goal, week targets). Extracted from the runs module in RUN-49 the
// moment a second consumer appeared.
//
// The whole file works in UTC on purpose. The API's dates are calendar-day
// strings (yyyy-mm-dd, docs/data-model.md); the server cannot know the
// client's timezone, so every server-side date computation pins itself to
// UTC and any client-vs-server day skew is handled explicitly at the call
// sites that care (the one-day slack in the runs date validator, the
// current-week window in week targets).

export const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// True for strings naming a real calendar day. Catches both wrong shapes
// and impossible days like 2026-02-31, which the Date constructor would
// silently roll over into March: constructing the day in UTC and reading
// it back must reproduce every component exactly.
export function isRealCalendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DAY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

// The DATE column round-trips through JS as a Date pinned to UTC midnight,
// so slicing the ISO string is exact in both directions. Never build these
// with `new Date(isoString)` maths in local time: west of Greenwich that
// lands on the previous day.
export function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function toIsoDate(dbDate: Date): string {
  return dbDate.toISOString().slice(0, 10);
}

// The UTC calendar day an instant falls on. toISOString always renders in
// UTC, so the slice IS the UTC day; named separately from toIsoDate because
// the intent differs - this converts a moment in time, toIsoDate reads a
// midnight-pinned DATE column back out.
export function utcDayOf(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

// Today as a UTC calendar day; local getters would silently shift the day
// on any server not running in UTC.
export function utcTodayIso(): string {
  return utcDayOf(new Date());
}

// Calendar arithmetic on day strings. setUTCDate handles month and year
// boundaries, so callers never re-implement rollover.
export function addDaysIso(isoDate: string, days: number): string {
  const date = toDbDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

// The Monday of the week `isoDate` falls in, matching the frontend's
// startOfWeek (weeks start on Monday throughout the app). getUTCDay counts
// Sunday as 0, hence the +6 shuffle to make Monday the zero point.
export function mondayOf(isoDate: string): string {
  const date = toDbDate(isoDate);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return toIsoDate(date);
}
