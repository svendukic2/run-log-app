// Pure types, formatters and form helpers for community events (RUN-68),
// stateless by construction: no store, no window, no React. Split from the
// API-backed store (events.ts) for the same reason runMath.ts is split from
// runs.ts - request-independent pure helpers must never share a module with
// process-lifetime mutable state. Import from './events' (it re-exports
// everything here); this module exists so server-side code CAN import the
// pure parts safely if it ever needs them.

import { formatDate, formatDateShort, todayIso } from './runMath';

// The shared formatters event screens lean on, so components importing
// from './events' need no second lib import for a number or a day.
export { formatDate, formatKm, todayIso } from './runMath';

// Display order on the Events page: Active first (AC1), the future next,
// the past last. The backend's EVENT_STATES lists the same three values in
// timeline order; this one is presentation order, hence its own constant.
export const EVENT_STATE_ORDER = ['active', 'upcoming', 'finished'] as const;
export type EventState = (typeof EVENT_STATE_ORDER)[number];

// Section headings and card chips share these labels.
export const EVENT_STATE_LABEL: Record<EventState, string> = {
  active: 'Active',
  upcoming: 'Upcoming',
  finished: 'Finished',
};

// Chip fills per state, from the same soft-fill palette as EFFORT_CHIP:
// green for running now, amber for not yet, neutral for over.
export const EVENT_STATE_CHIP: Record<EventState, string> = {
  active: 'bg-success-soft text-success-text',
  upcoming: 'bg-warning-soft text-warning-text',
  finished: 'bg-muted text-secondary',
};

// One event as GET /api/events serves it (EventResponse in the backend's
// events.service.ts, the source of truth this hand-mirrors like every
// response shape). `state` is derived server-side from the dates against
// today and never stored; `joined` and `mine` are per-caller, which is what
// lets a card render its Join/Leave button (or withhold Leave from the
// owner) without the client tracking its own user id. Named CommunityEvent
// because `Event` is the DOM type.
export interface CommunityEvent {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  targetKm: number | null;
  state: EventState;
  participantCount: number;
  joined: boolean;
  mine: boolean;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

// What POST /api/events wants. targetKm is optional-and-absent rather than
// null: the create DTO validates a PRESENT targetKm as a positive number
// (null included), so "no goal" is expressed by omitting the key.
export interface CommunityEventDraft {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  targetKm?: number;
}

// Runtime guard for anything claiming to be a served event: every API body
// goes through it, so a malformed response is an error with a name, never a
// silently wrong shape in typed code (the isRun precedent).
export function isCommunityEvent(value: unknown): value is CommunityEvent {
  const event = value as CommunityEvent;
  return (
    typeof event?.id === 'string' &&
    typeof event.name === 'string' &&
    typeof event.description === 'string' &&
    typeof event.startDate === 'string' &&
    typeof event.endDate === 'string' &&
    (event.targetKm === null || typeof event.targetKm === 'number') &&
    EVENT_STATE_ORDER.includes(event.state) &&
    typeof event.participantCount === 'number' &&
    typeof event.joined === 'boolean' &&
    typeof event.mine === 'boolean' &&
    typeof event.owner?.id === 'string' &&
    typeof event.owner.firstName === 'string' &&
    typeof event.owner.lastName === 'string'
  );
}

// Mirrors the ordering of GET /api/events (startDate ascending, id
// ascending as the same-day tiebreak). The two MUST change together - the
// client re-sorts its cache with this after every mutation, and any
// divergence makes a freshly created event jump position on the next load.
export function compareEventsChronological(a: CommunityEvent, b: CommunityEvent): number {
  return a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id);
}

// Collapses duplicate ids, last occurrence winning (the later page saw the
// row later). The paginated walk needs this: offset pages are not one
// snapshot, so a row created mid-walk can shift another row across a page
// boundary and deliver it twice - which would reach React as a duplicate
// key.
export function dedupeEventsById(events: CommunityEvent[]): CommunityEvent[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  return [...byId.values()];
}

// The page's grouping (AC1): every event lands in exactly one bucket, each
// bucket keeping the API's chronological order.
export function groupEventsByState(events: CommunityEvent[]): Record<EventState, CommunityEvent[]> {
  const groups: Record<EventState, CommunityEvent[]> = {
    active: [],
    upcoming: [],
    finished: [],
  };
  for (const event of events) groups[event.state].push(event);
  return groups;
}

// The card's date window: "Aug 11 - Aug 18, 2026" (en dash in the UI), a
// one-day event collapses to its single date, and a window across a year
// boundary spells out both years. The yearless side is runMath's
// formatDateShort, so run screens and event windows cannot drift to
// different date renderings.
export function formatEventWindow(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatDate(startDate);
  if (startDate.slice(0, 4) !== endDate.slice(0, 4)) {
    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }
  return `${formatDateShort(startDate)} – ${formatDate(endDate)}`;
}

// "1 runner" / "3 runners": the card's participant caption. The owner is a
// participant from creation (AC1 of RUN-67), so the count is never 0.
export function formatParticipantCount(count: number): string {
  return `${count} ${count === 1 ? 'runner' : 'runners'}`;
}

/* Participants and the event leaderboard (RUN-69) ---------------------------- */

// One member of one event, as GET /api/events/:id/participants serves it
// (EventParticipantResponse in the backend, hand-mirrored like every
// response shape). `id` is the USER's id, which is what the row links to.
//
// The four nullables move together and mean one thing: this runner is off
// leaderboards (RUN-64's showOnLeaderboard, honoured here per AC3). The
// server withholds the numbers rather than flagging them, so a null rank is
// the only signal the client gets - and the only one it needs.
//
// `unverified` (RUN-72) is one of those numbers, not a decoration on top of
// them: it is derived from that runner's runs, so an unranked row does not
// carry it either.
export interface EventParticipant {
  id: string;
  firstName: string;
  lastName: string;
  joinedAt: string;
  me: boolean;
  rank: number | null;
  totalKm: number | null;
  runCount: number | null;
  unverified: boolean | null;
}

export function isEventParticipant(value: unknown): value is EventParticipant {
  const row = value as EventParticipant;
  const rankedTogether =
    row?.rank === null
      ? row.totalKm === null && row.runCount === null && row.unverified === null
      : typeof row?.rank === 'number' &&
        typeof row.totalKm === 'number' &&
        typeof row.runCount === 'number' &&
        typeof row.unverified === 'boolean';
  return (
    typeof row?.id === 'string' &&
    typeof row.firstName === 'string' &&
    typeof row.lastName === 'string' &&
    typeof row.joinedAt === 'string' &&
    typeof row.me === 'boolean' &&
    rankedTogether
  );
}

/* The event's tagged runs (RUN-76) ------------------------------------------- */

// One run tagged to this event, as GET /api/events/:id/runs serves it
// (EventRunResponse, hand-mirrored). Narrower than a Run on purpose: this is
// somebody else's run seen through an event, so it carries no note and no
// route - the route is gated by a privacy setting this endpoint does not read.
export interface EventRun {
  id: string;
  date: string;
  distanceKm: number;
  durationSeconds: number;
  runner: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export function isEventRun(value: unknown): value is EventRun {
  const row = value as EventRun;
  return (
    typeof row?.id === 'string' &&
    typeof row.date === 'string' &&
    typeof row.distanceKm === 'number' &&
    typeof row.durationSeconds === 'number' &&
    typeof row.runner?.id === 'string' &&
    typeof row.runner.firstName === 'string' &&
    typeof row.runner.lastName === 'string'
  );
}

// One option in the run form's event picker, from
// GET /api/events/taggable?date= (TaggableEventResponse). The window comes
// along so the form can say WHY the list is what it is.
export interface TaggableEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export function isTaggableEvent(value: unknown): value is TaggableEvent {
  const row = value as TaggableEvent;
  return (
    typeof row?.id === 'string' &&
    typeof row.name === 'string' &&
    typeof row.startDate === 'string' &&
    typeof row.endDate === 'string'
  );
}

// A ranked row: the same participant, with the nullables narrowed away, so
// the leaderboard component never re-checks what the filter already proved.
export type RankedParticipant = EventParticipant & {
  rank: number;
  totalKm: number;
  runCount: number;
  unverified: boolean;
};

// AC2's board out of AC1's list: everyone the server ranked, in rank order.
// Ties share a rank server-side, so the name tiebreak here only decides
// which of two equal runners is drawn first - never who placed higher.
export function leaderboardOf(participants: EventParticipant[]): RankedParticipant[] {
  return participants
    .filter((row): row is RankedParticipant => row.rank !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
    );
}

// "AT" for Ana Tester: the avatar stand-in every community row wears until
// real avatars exist. Falls back to the first character of whichever name is
// present, and to "?" when neither is.
export function initialsOf(firstName: string, lastName: string): string {
  const initials = `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`;
  return initials.toUpperCase() || '?';
}

// "1 follower" / "3 followers": the naive English plural, for counts whose
// noun just takes an -s. Lives beside initialsOf because the same community
// rows need both (review fix: the profile header and the People page had
// grown a copy each).
export function formatCount(value: number, noun: string): string {
  return `${value} ${value === 1 ? noun : `${noun}s`}`;
}

// "1 run" / "4 runs": the leaderboard's secondary column.
export function formatRunCount(count: number): string {
  return formatCount(count, 'run');
}

/* Form values ---------------------------------------------------------------- */

// The create form mirrors the API's own bounds (create-event.dto.ts), so a
// value the form accepts cannot 400 on length.
export const EVENT_NAME_MAX_LENGTH = 120;
export const EVENT_DESCRIPTION_MAX_LENGTH = 2000;

export interface EventFormValues {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  targetKm: string;
}

export type EventFormField = 'name' | 'description' | 'startDate' | 'endDate' | 'targetKm';
export type EventFormErrors = Partial<Record<EventFormField, string>>;

// A freshly opened modal starts as a one-day event today: both dates
// prefilled (the Add run precedent of defaulting the date), so the shortest
// path to a valid event is typing a name and saving.
export function emptyEventForm(): EventFormValues {
  return {
    name: '',
    description: '',
    startDate: todayIso(),
    endDate: todayIso(),
    targetKm: '',
  };
}

// Validates like the Add run modal (AC3): a map rather than a throw, so the
// form shows every problem at once. The rules mirror the backend DTO - name
// required and bounded, dates required with end on/after start (events may
// be fully in the past or future; only the order is a rule), target
// optional but positive when given.
export function validateEventForm(values: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {};

  const name = values.name.trim();
  if (!name) {
    errors.name = 'Event name is required';
  } else if (name.length > EVENT_NAME_MAX_LENGTH) {
    errors.name = `Keep the name under ${EVENT_NAME_MAX_LENGTH} characters`;
  }

  if (values.description.trim().length > EVENT_DESCRIPTION_MAX_LENGTH) {
    errors.description = `Keep the description under ${EVENT_DESCRIPTION_MAX_LENGTH} characters`;
  }

  if (!values.startDate) errors.startDate = 'Start date is required';
  if (!values.endDate) {
    errors.endDate = 'End date is required';
  } else if (values.startDate && values.endDate < values.startDate) {
    // ISO day strings compare chronologically as strings; the error sits on
    // the end date, the field the eye reaches second.
    errors.endDate = "End date can't be before the start date";
  }

  if (values.targetKm.trim()) {
    const target = Number(values.targetKm.trim().replace(',', '.'));
    if (!Number.isFinite(target) || target <= 0) {
      errors.targetKm = 'Enter a target greater than 0';
    }
  }

  return errors;
}

// Only ever called with values that already passed validateEventForm.
export function toEventDraft(values: EventFormValues): CommunityEventDraft {
  const target = values.targetKm.trim();
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    startDate: values.startDate,
    endDate: values.endDate,
    ...(target && { targetKm: Number(target.replace(',', '.')) }),
  };
}
