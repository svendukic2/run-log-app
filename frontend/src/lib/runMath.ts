// Pure maths, types, formatters and form helpers for runs (RUN-23),
// stateless by construction: no store, no window, no React. Split from the
// API-backed store (runs.ts) in RUN-48 so that request-independent pure
// helpers never share a module with process-lifetime mutable state - the
// combination is how a Server Component import turns into a cross-user data
// leak. Import from './runs' as before (it re-exports everything here);
// this module exists so server-side code CAN import the pure parts safely
// if it ever needs them.

export const EFFORT_LEVELS = ['Easy', 'Medium', 'Hard'] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

// Chip fills for an effort badge (design node 57:51): Easy green, Medium
// amber, Hard coral, on their soft fills with the darker "* Text" tokens.
// Shared vocabulary next to the Effort type itself, so the runs table
// (RUN-24) and the run detail header (RUN-27) cannot drift apart.
export const EFFORT_CHIP: Record<Effort, string> = {
  Easy: 'bg-success-soft text-success-text',
  Medium: 'bg-warning-soft text-warning-text',
  Hard: 'bg-accent-soft text-accent-pressed',
};

// Medium is preselected in the Add run modal (ADD-2, AC1).
export const DEFAULT_EFFORT: Effort = 'Medium';

/* Routes (RUN-54) ---------------------------------------------------------- */

// One point the runner tapped on the map, in Leaflet's own {lat, lng} order
// (which is also what POST /api/routes/plan takes - see the backend DTO for
// why the provider's [lng, lat] flip stays server-side).
export interface RouteWaypoint {
  lat: number;
  lng: number;
}

// A run's drawn route, exactly the shape the API serves (docs/data-model.md).
export interface RunRoute {
  // Encoded polyline, precision 5. Drawn here from the plan response and
  // decoded for display by the map (RUN-55).
  polyline: string;
  // The tapped points, 2-5 of them: [0] is Start, the last is Finish, and up
  // to MAX_ROUTE_WAYPOINTS numbered points sit between. Kept because the
  // polyline's hundreds of coordinates cannot be turned back into the handful
  // of markers the picker needs to restore, move or remove (AC5).
  //
  // EMPTY on a trimmed route (see below): the first and last tapped points are
  // the address the trim removed, so the server does not send them.
  waypoints: RouteWaypoint[];
  // Who drew it, which is also what marks it a reconstruction rather than GPS
  // truth. Server-assigned; the client never sends one.
  source: string;
  // Whether the server cut the first and last ~300 m off before sending
  // (RUN-55 AC4). True only for somebody else's run on a public profile.
  //
  // The map MUST honour this: a trimmed line's ends are not the run's start and
  // finish, so it draws no Start/Finish markers and says the ends are trimmed.
  // Server-assigned like `source`, and equally not something a client decides.
  trimmed: boolean;
}

// What the API ACCEPTS for a route, which is not what it serves: `source` is
// server-assigned, and sending one is rejected outright by the API's whitelist
// pipe (backend RunRouteDto deliberately has no such property). Hence a
// separate type rather than reusing RunRoute for writes - the asymmetry is the
// contract, not an oversight.
export type RunRouteDraft = Pick<RunRoute, 'polyline' | 'waypoints'>;

// A run as it is SUBMITTED: no id, and the write-shaped route above.
export interface RunDraft extends Omit<Run, 'id' | 'route'> {
  route?: RunRouteDraft | null;
}

// The picker offers three numbered waypoints between Start and Finish, the
// same cap the plan endpoint enforces (MAX_WAYPOINTS there).
export const MAX_ROUTE_WAYPOINTS = 3;
export const MIN_ROUTE_POINTS = 2;
export const MAX_ROUTE_POINTS = MAX_ROUTE_WAYPOINTS + 2;

// How far the routed distance may drift from the entered one before the form
// says something (AC2). A reconstruction from five points is expected to be
// approximate; a fifth off is no longer approximate, it is a different run.
export const ROUTE_MISMATCH_TOLERANCE = 0.2;

// The amber hint under the map, or null when the two distances agree closely
// enough to say nothing. Deliberately a HINT and nothing else: the entered
// distance stays the source of truth, it is never corrected from the map, and
// this never blocks a save (AC2).
export function routeMismatchHint(routedKm: number, enteredKm: number): string | null {
  // A zero or nonsensical entered distance cannot be compared against
  // (the form rejects it anyway, so this is only reachable mid-typing).
  if (!Number.isFinite(routedKm) || !Number.isFinite(enteredKm) || enteredKm <= 0) {
    return null;
  }
  if (Math.abs(routedKm - enteredKm) / enteredKm <= ROUTE_MISMATCH_TOLERANCE) return null;
  return `Routed distance is ${formatDistanceKm(routedKm)}, but you logged ${formatDistanceKm(
    enteredKm,
  )}. Add a waypoint where you turned.`;
}

// Whether a stored route still describes the points on the map. This is what
// tells the Route step "the polyline you are holding is for these markers" and
// so whether a new plan request is needed at all - a plain identity check on
// the array would re-plan on every render, and a length check would miss a
// dragged marker.
export function sameWaypoints(
  a: RouteWaypoint[] | null | undefined,
  b: RouteWaypoint[],
): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((point, index) => point.lat === b[index].lat && point.lng === b[index].lng);
}

export function isRouteWaypoint(value: unknown): value is RouteWaypoint {
  const point = value as RouteWaypoint;
  return (
    typeof point?.lat === 'number' &&
    Number.isFinite(point.lat) &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lng)
  );
}

export function isRunRoute(value: unknown): value is RunRoute {
  const route = value as RunRoute;
  if (
    typeof route?.polyline !== 'string' ||
    route.polyline.length === 0 ||
    typeof route.source !== 'string' ||
    typeof route.trimmed !== 'boolean' ||
    !Array.isArray(route.waypoints) ||
    !route.waypoints.every(isRouteWaypoint)
  ) {
    return false;
  }
  // The waypoint count depends on which of the two routes this is, and the
  // asymmetry is the contract rather than laxity: a full route always carries
  // the 2-5 points the picker restores from, and a trimmed one carries none,
  // because its first and last would be the address the trim removed (RUN-55
  // AC4). A trimmed route WITH waypoints is a server bug, and treating it as
  // unreadable is how it stops at the boundary instead of reaching a map.
  return route.trimmed
    ? route.waypoints.length === 0
    : route.waypoints.length >= MIN_ROUTE_POINTS &&
        route.waypoints.length <= MAX_ROUTE_POINTS;
}

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
  // The optional drawn route (RUN-54). The API always sends the key (null for
  // a run with no route), but it stays optional in the type because absent and
  // null mean the same thing and every run that predates the field - the v1
  // localStorage import among them - arrives without it.
  route?: RunRoute | null;
}

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

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

// "Jul 14": DSH-8 shows no year on the recent-runs card (RUN-20). No timeZone
// on the formatter is deliberate: fromIsoDate builds a local-midnight date, so
// formatting in the local zone can never shift the day.
export function formatDateShort(isoDate: string): string {
  return SHORT_DATE_FORMATTER.format(fromIsoDate(isoDate));
}

// Row captions on the recent-runs card (RUN-20): "42 min" and "8.2 km". In
// the shared lib so this card and the runs table cannot drift apart on
// rounding.
export function formatDurationMinutes(totalSeconds: number): string {
  return `${Math.round(totalSeconds / 60)} min`;
}

export function formatDistanceKm(km: number): string {
  return `${km.toFixed(1)} km`;
}

// Distances round to one decimal exactly once, and every derived caption or
// bar uses the rounded value, so "14.3 / 20 km" and "5.7 km to go" always add
// up (RUN-17; shared since RUN-21).
export function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

// Whole kilometres without a decimal ("14"), fractional ones with one
// ("13.6"), matching the goal readouts in the mocks.
export function formatKm(km: number): string {
  const rounded = roundKm(km);
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
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

// The inverse of toRunDraft: a stored run as the form shows it, so Edit run
// opens prefilled with exactly that run's values (RUN-28 AC1). The prefilled
// note is the stored note - the mock's note differs from Run detail's for the
// same run, which is a copy conflict flagged with the designer (EDT-4, A20);
// the app has a single stored note, so both screens render that.
export function runToForm(run: Run): RunFormValues {
  return {
    routeName: run.routeName,
    distance: `${run.distanceKm}`,
    duration: formatDuration(run.durationSeconds),
    date: run.date,
    effort: run.effort,
    // isRun never checks the note, so a hand-edited or older stored run can
    // arrive without one; the form still needs a string.
    note: run.note ?? '',
  };
}

// Only ever called with values that already passed validateRunForm. The route
// is a second argument rather than a form field because it is not text the
// user typed: it is the map's state, which the modal owns separately (RUN-54).
// Always sent explicitly, null included - null is how the API is told "no
// route", and on an edit it is how a cleared map survives the save.
export function toRunDraft(values: RunFormValues, route: RunRoute | null = null): RunDraft {
  return {
    routeName: values.routeName.trim(),
    distanceKm: Number(values.distance.trim().replace(',', '.')),
    durationSeconds: parseDuration(values.duration) ?? 0,
    date: values.date,
    effort: values.effort,
    note: values.note.trim(),
    // Narrowed to the two fields the API accepts. Passing the route through
    // whole would carry `source` along, and the API's whitelist pipe rejects
    // unknown properties - so every save of a routed run would be a 400.
    route: route ? { polyline: route.polyline, waypoints: route.waypoints } : null,
  };
}

// The distance the form currently holds, in km, or null while it is not a
// usable number. The mismatch hint needs this from inside the Route step,
// where the value is still the raw string the user typed.
export function enteredDistanceKm(values: RunFormValues): number | null {
  const km = Number(values.distance.trim().replace(',', '.'));
  return Number.isFinite(km) && km > 0 ? km : null;
}



// The sort dropdown on the Runs page offers newest and oldest (RUN-24 AC4,
// assumption A7). One comparator per direction rather than sort-then-reverse,
// so same-day runs keep their stored order under either sort, and the copy
// leaves the caller's array untouched.
export type RunSortOrder = 'newest' | 'oldest';

export function sortRuns(runs: Run[], order: RunSortOrder): Run[] {
  const direction = order === 'oldest' ? 1 : -1;
  return [...runs].sort((a, b) => direction * a.date.localeCompare(b.date));
}

// The Mon-Sun week starts for the `count` weeks ending with the one `isoDate`
// falls in, oldest first: the x-axis of the dashboard distance chart (RUN-19).
export function lastWeekStarts(isoDate: string, count: number): string[] {
  const monday = fromIsoDate(startOfWeek(isoDate));
  return Array.from({ length: count }, (_, index) => {
    const weekStart = new Date(monday);
    weekStart.setDate(monday.getDate() - 7 * (count - 1 - index));
    return toIsoDate(weekStart);
  });
}

// The ISO dates of the `count` days ending with `isoDate`, oldest first: the
// x-axis of the dashboard distance chart since its daily redesign (RUN-19).
export function lastDays(isoDate: string, count: number): string[] {
  const end = fromIsoDate(isoDate);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end);
    day.setDate(end.getDate() - (count - 1 - index));
    return toIsoDate(day);
  });
}

// Total distance logged on a single day. Run.date is a plain ISO day string,
// so membership is a string comparison, like the weekly selector below.
export function distanceForDay(runs: Run[], isoDate: string): number {
  return runs
    .filter((run) => run.date === isoDate)
    .reduce((total, run) => total + run.distanceKm, 0);
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

// Runtime guard for anything claiming to be a stored/served run: API
// responses and the one-time v1 localStorage import both go through it.
// Checks every field of the contract, note included.
export function isRun(value: unknown): value is Run {
  const run = value as Run;
  return (
    typeof run?.id === 'string' &&
    typeof run.routeName === 'string' &&
    typeof run.distanceKm === 'number' &&
    typeof run.durationSeconds === 'number' &&
    typeof run.date === 'string' &&
    EFFORT_LEVELS.includes(run.effort) &&
    typeof run.note === 'string' &&
    // Absent and null are both "no route"; anything else must be a complete
    // one, because a polyline with no waypoints is a route the picker cannot
    // restore rather than a partial one (RUN-54).
    (run.route === undefined || run.route === null || isRunRoute(run.route))
  );
}
