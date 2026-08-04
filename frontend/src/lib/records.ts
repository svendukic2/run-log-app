// Personal records derived from logged runs (RUN-26, RUN-10/RUN-11). Records
// are never stored: every call recomputes them from the runs it is given, so
// adding, editing or deleting a run can never leave a stale record behind
// (AC2). A record type with no qualifying run returns nothing and its card is
// hidden (A24).
//
// Known data conflicts in the mocks stay flagged for the designer (A20,
// RUN-12): 08 credits the longest run differently from 07, and 08's
// "Fastest 5K 24:18" does not match its own "Best pace 4:51 /km" (4:51 x 5 is
// 24:15). The derivations below follow the maths, so live values are always
// self-consistent even where the mock is not.
import {
  formatDateShort,
  formatDistanceKm,
  formatDuration,
  formatPace,
  fromIsoDate,
  paceSecondsPerKm,
  startOfWeek,
  toIsoDate,
  type Run,
} from './runs';

export const RECORD_KINDS = [
  'longest-run',
  'fastest-5k',
  'fastest-10k',
  'best-pace',
  'biggest-week',
  'longest-streak',
] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

export interface RunRecord {
  kind: RecordKind;
  label: string;
  // Both preformatted here so the cards and any future surface (the AI coach,
  // say) cannot drift apart on rounding or units.
  value: string;
  caption: string;
}

// "Tempo run · Jun 29", the source caption every run-backed record carries.
function runCaption(run: Run): string {
  return `${run.routeName} · ${formatDateShort(run.date)}`;
}

// Records credit the first run to set them: candidates arrive oldest first
// and only a strictly better score takes the record over.
function sortByDateAscending(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => a.date.localeCompare(b.date));
}

function bestRun(runs: Run[], score: (run: Run) => number, lowerIsBetter: boolean): Run | null {
  let best: Run | null = null;
  let bestScore = 0;
  for (const run of runs) {
    const candidate = score(run);
    if (best === null || (lowerIsBetter ? candidate < bestScore : candidate > bestScore)) {
      best = run;
      bestScore = candidate;
    }
  }
  return best;
}

function longestRunRecord(runs: Run[]): RunRecord | null {
  const run = bestRun(runs, (candidate) => candidate.distanceKm, false);
  if (!run) return null;
  return {
    kind: 'longest-run',
    label: 'Longest run',
    value: formatDistanceKm(run.distanceKm),
    caption: runCaption(run),
  };
}

// Fastest 5K/10K is the pace of a qualifying run held for the record
// distance: nobody logs a lap-perfect 5.0 km, so a 7.2 km tempo at 4:51 /km
// counts as a 24:15 five-K. Only runs at least that long qualify (A24's own
// example: no run of 10K or more hides the 10K card).
function fastestRecord(runs: Run[], km: number, kind: RecordKind, label: string): RunRecord | null {
  const qualifying = runs.filter((run) => run.distanceKm >= km);
  const run = bestRun(qualifying, paceSecondsPerKm, true);
  if (!run) return null;
  return {
    kind,
    label,
    value: formatDuration(paceSecondsPerKm(run) * km),
    caption: runCaption(run),
  };
}

function bestPaceRecord(runs: Run[]): RunRecord | null {
  const run = bestRun(runs, paceSecondsPerKm, true);
  if (!run) return null;
  return {
    kind: 'best-pace',
    label: 'Best pace',
    value: formatPace(run),
    caption: runCaption(run),
  };
}

function biggestWeekRecord(runs: Run[]): RunRecord | null {
  // Weeks are keyed by the ISO date of their Monday, as everywhere else.
  // Insertion order is oldest first, so a strictly-greater comparison keeps
  // the earliest week on a tie, like the run-backed records do.
  const weekKm = new Map<string, number>();
  for (const run of runs) {
    const week = startOfWeek(run.date);
    weekKm.set(week, (weekKm.get(week) ?? 0) + run.distanceKm);
  }

  let best: { week: string; km: number } | null = null;
  for (const [week, km] of weekKm) {
    if (!best || km > best.km) best = { week, km };
  }
  if (!best) return null;

  return {
    kind: 'biggest-week',
    label: 'Biggest week',
    value: formatDistanceKm(best.km),
    caption: `Week of ${formatDateShort(best.week)}`,
  };
}

function nextIsoDay(isoDate: string): string {
  const date = fromIsoDate(isoDate);
  date.setDate(date.getDate() + 1);
  return toIsoDate(date);
}

// "Jun 17 – 22" inside a month, "Jun 30 – Jul 1" across one, and a single
// "Jun 24" for a one-day streak (an en dash, as the mock uses).
function formatStreakRange(startIso: string, endIso: string): string {
  if (startIso === endIso) return formatDateShort(startIso);
  if (startIso.slice(0, 7) === endIso.slice(0, 7)) {
    return `${formatDateShort(startIso)} – ${fromIsoDate(endIso).getDate()}`;
  }
  return `${formatDateShort(startIso)} – ${formatDateShort(endIso)}`;
}

function longestStreakRecord(runs: Run[]): RunRecord | null {
  if (runs.length === 0) return null;

  // A streak counts calendar days with at least one run, so two runs on the
  // same day collapse into it. `runs` arrives sorted, and the Set keeps that
  // order.
  const days = [...new Set(runs.map((run) => run.date))];

  let best = { days: 1, start: days[0], end: days[0] };
  let current = best;
  for (let i = 1; i < days.length; i += 1) {
    current =
      days[i] === nextIsoDay(days[i - 1])
        ? { days: current.days + 1, start: current.start, end: days[i] }
        : { days: 1, start: days[i], end: days[i] };
    // Strictly greater: the earliest of equally long streaks keeps the record.
    if (current.days > best.days) best = current;
  }

  return {
    kind: 'longest-streak',
    label: 'Longest streak',
    value: `${best.days} ${best.days === 1 ? 'day' : 'days'}`,
    caption: formatStreakRange(best.start, best.end),
  };
}

// The six records of 08 · Runs - Records, in card order (AC1). Record types
// with no qualifying run are simply absent (AC3).
export function deriveRecords(runs: Run[]): RunRecord[] {
  const ordered = sortByDateAscending(runs);
  return [
    longestRunRecord(ordered),
    fastestRecord(ordered, 5, 'fastest-5k', 'Fastest 5K'),
    fastestRecord(ordered, 10, 'fastest-10k', 'Fastest 10K'),
    bestPaceRecord(ordered),
    biggestWeekRecord(ordered),
    longestStreakRecord(ordered),
  ].filter((record): record is RunRecord => record !== null);
}
