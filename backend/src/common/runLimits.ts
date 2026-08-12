// Anti-cheat guardrails for manually entered runs (RUN-72). Pure and
// dependency-free like privacy.ts and ranking.ts next to it, so the rules
// are tested without a database and every caller reads one copy.
//
// THESE ARE HONEST-MISTAKE GUARDS, NOT FRAUD PROOF. Every number in this
// app is typed by the person it flatters, so nothing here can prove a run
// happened. What the limits do catch is the mistake: a distance entered in
// metres, a duration entered in minutes, a stray zero. Someone determined
// to invent a plausible run still can, and that is accepted rather than
// papered over with a stricter number that would start rejecting real
// ultras.
//
// Two tiers, and the difference matters:
//
// - RUN_LIMITS are HARD. Past them the API refuses the write (400), so
//   nothing outside them is ever stored.
// - RUN_OUTLIER_THRESHOLDS are SOFT. A run past them is legal, saved and
//   ranked exactly like any other; it only picks up the subtle
//   "unverified" marker on leaderboards, which is a note that a number is
//   unusual, never an accusation.
//
// Boundaries are INCLUSIVE-LEGAL on the hard limits: exactly 150 km passes,
// exactly 2:30 /km passes, exactly 24 h passes, and anything past them
// fails. The soft thresholds read the other way round, strictly: exactly
// 3:30 /km and exactly 60 km are ordinary, faster or longer is flagged.

// The hard limits. RUN-71's seeder imports these rather than repeating the
// literals, so demo data cannot drift past the rules that guard real data.
export const RUN_LIMITS = {
  maxDistanceKm: 150,
  fastestPaceSecPerKm: 150, // 2:30 /km
  slowestPaceSecPerKm: 1200, // 20:00 /km
  maxDurationSec: 86400, // 24 h
} as const;

// The soft thresholds behind the leaderboard marker: fast enough or long
// enough to be worth a second look, well inside what a real runner does.
export const RUN_OUTLIER_THRESHOLDS = {
  fastPaceSecPerKm: 210, // 3:30 /km
  longDistanceKm: 60,
} as const;

// The two fields every rule here reads. Deliberately not the DTO or the
// Prisma row: create, update and both leaderboards each hand over a
// different shape, and all any rule needs is these two numbers.
export interface RunMeasurements {
  distanceKm: number;
  durationSeconds: number;
}

// Seconds per kilometre, the number both tiers are expressed in. Callers
// guard the zero themselves (see below); this stays a plain division so it
// can be read at a glance.
function paceSecPerKm(run: RunMeasurements): number {
  return run.durationSeconds / run.distanceKm;
}

// "2:30", the way the app writes a pace, so a rejection message names the
// limit in the same units the runner reads on their watch.
function formatPace(secPerKm: number): string {
  const whole = Math.round(secPerKm);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// The hard check. Returns the message explaining the FIRST rule broken, or
// null when the run is within every limit.
//
// A message, not an exception: this module stays free of Nest so both the
// service that throws a BadRequestException and the seeder that just wants
// to know can call it. Messages follow the DTOs' tone next door - the
// field, the limit, the number that broke it, and no lecture.
export function runLimitViolation(run: RunMeasurements): string | null {
  const { distanceKm, durationSeconds } = run;

  // The DTOs already reject a non-positive distance or duration, so the
  // pace division below cannot see a zero. This guard exists for the
  // callers with no DTO in front of them (the seeder), where dividing by
  // zero would silently produce Infinity and pass the pace check.
  if (!(distanceKm > 0) || !(durationSeconds > 0)) {
    return 'distanceKm and durationSeconds must both be greater than 0';
  }

  if (distanceKm > RUN_LIMITS.maxDistanceKm) {
    return `distanceKm must be at most ${RUN_LIMITS.maxDistanceKm} km per run`;
  }

  if (durationSeconds > RUN_LIMITS.maxDurationSec) {
    return `durationSeconds must be at most ${RUN_LIMITS.maxDurationSec} seconds (24 hours) per run`;
  }

  const pace = paceSecPerKm(run);
  if (
    pace < RUN_LIMITS.fastestPaceSecPerKm ||
    pace > RUN_LIMITS.slowestPaceSecPerKm
  ) {
    return `distanceKm and durationSeconds work out to ${formatPace(pace)} /km; a run must be between ${formatPace(
      RUN_LIMITS.fastestPaceSecPerKm,
    )} and ${formatPace(RUN_LIMITS.slowestPaceSecPerKm)} /km`;
  }

  return null;
}

// The soft check: is this legal run extreme enough to carry the marker?
// Applied per RUN, never per aggregated total, because a week adding up to
// 80 km is a good week while one 80 km run is the unusual thing.
export function isOutlierRun(run: RunMeasurements): boolean {
  if (run.distanceKm > RUN_OUTLIER_THRESHOLDS.longDistanceKm) return true;
  if (!(run.distanceKm > 0)) return false;
  return paceSecPerKm(run) < RUN_OUTLIER_THRESHOLDS.fastPaceSecPerKm;
}

// Which runners in a set of runs logged at least one outlier. Both
// leaderboards aggregate runs into one row per runner, so both need exactly
// this reduction, and sharing it is what makes the marker mean the same
// thing on the global board and on an event's (AC2 says "any leaderboard").
export function outlierUserIds(
  runs: Array<RunMeasurements & { userId: string }>,
): Set<string> {
  const flagged = new Set<string>();
  for (const run of runs) {
    if (isOutlierRun(run)) flagged.add(run.userId);
  }
  return flagged;
}
