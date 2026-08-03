// Local persistence and maths for logged runs (RUN-23). Like the profile, runs
// stay on this device: there is no account and no backend yet.
import { useSyncExternalStore } from 'react';

export const EFFORT_LEVELS = ['Easy', 'Medium', 'Hard'] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

// Medium is preselected in the Add run modal (ADD-2, AC1).
export const DEFAULT_EFFORT: Effort = 'Medium';

export interface Run {
  id: string;
  routeName: string;
  distanceKm: number;
  // Stored in seconds so pace and weekly totals are plain arithmetic; the
  // "42:15" / "1:18:44" shapes are a display and input concern only.
  durationSeconds: number;
  // The day the run happened, as `yyyy-mm-dd`. A plain date, not a timestamp:
  // a run belongs to a calendar day wherever the device happens to be.
  date: string;
  effort: Effort;
  note: string;
}

const RUNS_KEY = 'runlog.runs';

// `storage` only fires in *other* tabs, so writes announce themselves to this
// one as well. Without it the page behind the modal would not refresh (ADD-3).
const RUNS_CHANGED_EVENT = 'runlog:runs-changed';

/* Dates -------------------------------------------------------------------- */

export function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// `new Date('2026-07-14')` is parsed as UTC and can land on the previous day
// west of Greenwich, so dates are always rebuilt from their parts.
export function fromIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

// Monday-first weeks, matching the Mon-Sun chart in the designs. Identifying a
// week by the ISO date of its Monday keeps "which week is this run in?" a
// string comparison (AC6).
export function startOfWeek(isoDate: string): string {
  const date = fromIsoDate(isoDate);
  // getDay() is 0 on Sunday, which closes the week rather than opening it.
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toIsoDate(date);
}

// Days of the Mon-Sun week still available, counting the given day itself:
// 7 on Monday, 1 on Sunday. Feeds the "{n} days left" caption (RUN-17).
export function daysLeftInWeek(isoDate: string): number {
  return 7 - ((fromIsoDate(isoDate).getDay() + 6) % 7);
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

// "Jul 14, 2026", as the runs table and the modal show it.
export function formatDate(isoDate: string): string {
  return DATE_FORMATTER.format(fromIsoDate(isoDate));
}

/* Duration and pace -------------------------------------------------------- */

// Accepts the two shapes the designs use, `mm:ss` and `h:mm:ss` (ADD-6), and
// returns null for anything else so the caller can show one inline error.
export function parseDuration(input: string): number | null {
  const parts = input.trim().split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;
  if (!parts.every((part) => /^\d{1,3}$/.test(part))) return null;

  const numbers = parts.map(Number);
  // Every segment after the first is a remainder of 60, so "1:75:00" is a typo
  // rather than another way of writing 2:15:00. The leading one is free: a
  // 90-minute run may be entered as "90:00".
  if (numbers.slice(1).some((part) => part > 59)) return null;

  const [hours, minutes, seconds] = parts.length === 3 ? numbers : [0, ...numbers];
  return hours * 3600 + minutes * 60 + seconds;
}

// The inverse: "42:15" under an hour, "1:18:44" over it.
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const tail = `${seconds % 60}`.padStart(2, '0');
  if (minutes < 60) return `${minutes}:${tail}`;
  return `${Math.floor(minutes / 60)}:${`${minutes % 60}`.padStart(2, '0')}:${tail}`;
}

// The Weekly goal card's Time stat: "1h 12m" over an hour, "42m" under it
// (RUN-17, DSH-5). Coarser than formatDuration on purpose - at week scale the
// seconds are noise.
export function formatTimeCompact(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Pace is never entered, only derived (ADD-4, AC5).
export function paceSecondsPerKm(run: Pick<Run, 'distanceKm' | 'durationSeconds'>): number {
  return run.durationSeconds / run.distanceKm;
}

export function formatPace(run: Pick<Run, 'distanceKm' | 'durationSeconds'>): string {
  return `${formatDuration(paceSecondsPerKm(run))} /km`;
}

/* Form values -------------------------------------------------------------- */

export interface RunFormValues {
  routeName: string;
  distance: string;
  duration: string;
  date: string;
  effort: Effort;
  note: string;
}

export type RunFormField = 'routeName' | 'distance' | 'duration' | 'date';
export type RunFormErrors = Partial<Record<RunFormField, string>>;

// The state a freshly opened modal starts in (AC1).
export function emptyRunForm(): RunFormValues {
  return {
    routeName: '',
    distance: '',
    duration: '',
    date: todayIso(),
    effort: DEFAULT_EFFORT,
    note: '',
  };
}

// Everything but the note is required (ADD-7). Returning a map rather than
// throwing lets the form show every problem at once.
export function validateRunForm(values: RunFormValues): RunFormErrors {
  const errors: RunFormErrors = {};

  if (!values.routeName.trim()) errors.routeName = 'Route name is required';

  const distance = Number(values.distance.trim().replace(',', '.'));
  if (!values.distance.trim()) {
    errors.distance = 'Distance is required';
  } else if (!Number.isFinite(distance) || distance <= 0) {
    errors.distance = 'Enter a distance greater than 0';
  }

  const duration = parseDuration(values.duration);
  if (!values.duration.trim()) {
    errors.duration = 'Duration is required';
  } else if (duration === null) {
    errors.duration = 'Enter a duration as mm:ss or h:mm:ss';
  } else if (duration <= 0) {
    errors.duration = 'Enter a duration greater than 0';
  }

  if (!values.date) {
    errors.date = 'Date is required';
  } else if (values.date > todayIso()) {
    // A run is a thing that happened; the past is fine (ADD edge case), the
    // future is a typo. Not in the spec (A25 leaves validation open), raised
    // during Sprint 1 review - see RUN-23 AC7.
    errors.date = 'Date cannot be in the future';
  }

  return errors;
}

// Only ever called with values that already passed validateRunForm.
export function toRunDraft(values: RunFormValues): Omit<Run, 'id'> {
  return {
    routeName: values.routeName.trim(),
    distanceKm: Number(values.distance.trim().replace(',', '.')),
    durationSeconds: parseDuration(values.duration) ?? 0,
    date: values.date,
    effort: values.effort,
    note: values.note.trim(),
  };
}

/* Store -------------------------------------------------------------------- */

function isRun(value: unknown): value is Run {
  const run = value as Run;
  return (
    typeof run?.id === 'string' &&
    typeof run.routeName === 'string' &&
    typeof run.distanceKm === 'number' &&
    typeof run.durationSeconds === 'number' &&
    typeof run.date === 'string' &&
    EFFORT_LEVELS.includes(run.effort)
  );
}

// Newest run first, which is the order every screen shows them in.
function parseRuns(raw: string | null): Run[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRun).sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export function getRuns(): Run[] {
  if (typeof window === 'undefined') return [];
  return parseRuns(window.localStorage.getItem(RUNS_KEY));
}

export function addRun(draft: Omit<Run, 'id'>): Run {
  const run: Run = {
    ...draft,
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  };
  window.localStorage.setItem(RUNS_KEY, JSON.stringify([run, ...getRuns()]));
  window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
  return run;
}

function subscribeToRuns(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(RUNS_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(RUNS_CHANGED_EVENT, onStoreChange);
  };
}

// Storage-backed hook, safe during SSR/hydration the same way useProfile is:
// the snapshot React compares is the stored string, so parsing into a fresh
// array on every render cannot loop.
export function useRuns(): Run[] {
  const raw = useSyncExternalStore(
    subscribeToRuns,
    () => window.localStorage.getItem(RUNS_KEY),
    () => null,
  );
  return parseRuns(raw);
}

/* Selectors ---------------------------------------------------------------- */

// The sort dropdown on the Runs page offers newest and oldest (RUN-24 AC4,
// assumption A7). One comparator per direction rather than sort-then-reverse,
// so same-day runs keep their stored order under either sort, and the copy
// leaves the caller's array untouched.
export type RunSortOrder = 'newest' | 'oldest';

export function sortRuns(runs: Run[], order: RunSortOrder): Run[] {
  const direction = order === 'oldest' ? 1 : -1;
  return [...runs].sort((a, b) => direction * a.date.localeCompare(b.date));
}

export interface WeekTotals {
  runCount: number;
  distanceKm: number;
  durationSeconds: number;
}

// Totals for the week a given day falls in. Saving a run dated in a past week
// therefore moves that week's numbers, not the current week's (AC6).
export function totalsForWeek(runs: Run[], isoDate: string): WeekTotals {
  const week = startOfWeek(isoDate);
  return runs
    .filter((run) => startOfWeek(run.date) === week)
    .reduce<WeekTotals>(
      (totals, run) => ({
        runCount: totals.runCount + 1,
        distanceKm: totals.distanceKm + run.distanceKm,
        durationSeconds: totals.durationSeconds + run.durationSeconds,
      }),
      { runCount: 0, distanceKm: 0, durationSeconds: 0 },
    );
}
