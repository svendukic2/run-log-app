'use client';

// Typed wrappers over the RUN-49 account endpoints (/api/profile, /api/goal,
// /api/week-targets), shared by the profile store (onboarding.ts), the goal
// store (goal.ts) and the one-time v1 import. Each helper validates the
// response body before returning it: a malformed body is an error with a
// name, never a silently wrong shape in typed code (the same rule the runs
// store applies). This module is a leaf over session.ts + goalMath.ts so
// both stores can share it without an import cycle.
import { isRealIsoDay, type Goal } from './goalMath';
import { ApiError, apiFetch } from './session';

// Mirrors the RunningLevel union in docs/data-model.md: capitalized in the
// API and the database (the lowercase spellings were a v1 localStorage
// relic, gone with RUN-50).
export const RUNNING_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
export type RunningLevel = (typeof RUNNING_LEVELS)[number];

// The account's identity, exactly the GET/PUT /api/account contract
// (RUN-59): the User row's human-facing fields, the app's single source of
// truth for a runner's name and email.
export interface AccountRecord {
  firstName: string;
  lastName: string;
  email: string;
}

// The setup answers, exactly the GET/PUT /api/profile contract. Its
// existence server-side is what "onboarding complete" means (RUN-50).
export interface ProfileRecord {
  runningLevel: RunningLevel;
  defaultWeeklyGoalKm: number;
}

export interface WeekTarget {
  weekStart: string;
  targetKm: number;
}

// The account's privacy settings, exactly the GET/PUT /api/privacy contract
// (RUN-64). Three grants, all false by default: false is private
// everywhere, so a missing or forgotten field can only ever be MORE
// private, never less.
export interface PrivacySettings {
  profilePublic: boolean;
  showOnLeaderboard: boolean;
  showRoutes: boolean;
}

function isAccountRecord(body: unknown): body is AccountRecord {
  const record = body as AccountRecord;
  return (
    typeof record?.firstName === 'string' &&
    typeof record.lastName === 'string' &&
    typeof record.email === 'string'
  );
}

function isProfileRecord(body: unknown): body is ProfileRecord {
  const record = body as ProfileRecord;
  return (
    (RUNNING_LEVELS as readonly string[]).includes(record?.runningLevel) &&
    typeof record.defaultWeeklyGoalKm === 'number'
  );
}

function isPrivacySettings(body: unknown): body is PrivacySettings {
  const settings = body as PrivacySettings;
  return (
    typeof settings?.profilePublic === 'boolean' &&
    typeof settings.showOnLeaderboard === 'boolean' &&
    typeof settings.showRoutes === 'boolean'
  );
}

function isGoal(body: unknown): body is Goal {
  const goal = body as Goal;
  return (
    typeof goal?.km === 'number' &&
    typeof goal.startDate === 'string' &&
    isRealIsoDay(goal.startDate) &&
    (goal.endDate === null || (typeof goal.endDate === 'string' && isRealIsoDay(goal.endDate)))
  );
}

function isWeekTarget(body: unknown): body is WeekTarget {
  const target = body as WeekTarget;
  return (
    typeof target?.weekStart === 'string' &&
    isRealIsoDay(target.weekStart) &&
    typeof target.targetKm === 'number'
  );
}

async function parsed<T>(
  response: Response,
  guard: (body: unknown) => body is T,
  what: string,
): Promise<T> {
  const body: unknown = await response.json();
  if (!guard(body)) {
    throw new ApiError(`The server returned ${what} in an unexpected shape.`);
  }
  return body;
}

// Nest's ValidationPipe answers { message: string | string[] }; the first
// line is a sentence a form can show ("firstName must be at most 120
// characters").
async function validationMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message[0] : body.message;
    return typeof message === 'string' && message.length > 0 ? message : null;
  } catch {
    return null;
  }
}

function putJson(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// The signed-in account's identity. No 404 branch: the token was minted for
// this row, so its absence is an authentication problem the server answers
// with 401 (and session.ts turns into a clean sign-out).
export async function fetchAccount(): Promise<AccountRecord> {
  const response = await apiFetch('/api/account');
  if (!response.ok) {
    throw new ApiError(`Loading your account failed (${response.status}).`, response.status);
  }
  return parsed(response, isAccountRecord, 'an account');
}

// Changing the email changes the login credential, so a 409 (someone else
// owns that address) gets its own message: the Settings form shows it inline
// and the user can pick another. A 400 carries the server's own field
// message: the DTO's bounds (name length, address shape) are stricter than
// the form's, and "failed (400)" would leave the user with nothing to act on.
export async function putAccount(record: AccountRecord): Promise<AccountRecord> {
  const response = await putJson('/api/account', record);
  if (response.status === 409) {
    throw new ApiError('That email is already used by another account.', 409);
  }
  if (response.status === 400) {
    throw new ApiError((await validationMessage(response)) ?? 'Those details were rejected.', 400);
  }
  if (!response.ok) {
    throw new ApiError(`Saving your details failed (${response.status}).`, response.status);
  }
  return parsed(response, isAccountRecord, 'an account');
}

// 404 means "this account never finished onboarding" - an expected state
// the caller routes on, not an error.
export async function fetchProfile(): Promise<ProfileRecord | null> {
  const response = await apiFetch('/api/profile');
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new ApiError(`Loading your profile failed (${response.status}).`, response.status);
  }
  return parsed(response, isProfileRecord, 'a profile');
}

export async function putProfile(record: ProfileRecord): Promise<ProfileRecord> {
  const response = await putJson('/api/profile', record);
  if (!response.ok) {
    throw new ApiError(`Saving your profile failed (${response.status}).`, response.status);
  }
  return parsed(response, isProfileRecord, 'a profile');
}

// No 404 case, unlike the profile: the settings are columns on the account
// row, so a valid session always has them (at the private defaults from
// signup onwards). Anything but 200 is a real failure.
export async function fetchPrivacy(): Promise<PrivacySettings> {
  const response = await apiFetch('/api/privacy');
  if (!response.ok) {
    throw new ApiError(
      `Loading your privacy settings failed (${response.status}).`,
      response.status,
    );
  }
  return parsed(response, isPrivacySettings, 'privacy settings');
}

export async function putPrivacy(settings: PrivacySettings): Promise<PrivacySettings> {
  const response = await putJson('/api/privacy', settings);
  if (!response.ok) {
    throw new ApiError(
      `Saving your privacy settings failed (${response.status}).`,
      response.status,
    );
  }
  return parsed(response, isPrivacySettings, 'privacy settings');
}

// 404 means "no goal set yet" - a fresh account, not an error.
export async function fetchGoal(): Promise<Goal | null> {
  const response = await apiFetch('/api/goal');
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new ApiError(`Loading your goal failed (${response.status}).`, response.status);
  }
  return parsed(response, isGoal, 'a goal');
}

export async function putGoal(goal: Goal): Promise<Goal> {
  const response = await putJson('/api/goal', goal);
  if (!response.ok) {
    throw new ApiError(`Saving your goal failed (${response.status}).`, response.status);
  }
  return parsed(response, isGoal, 'a goal');
}

// Get-or-create for the CURRENT week (the server materializes it on first
// read, docs/data-model.md). A past or future week answers 404, which maps
// to null here: "no target was ever recorded for that week".
export async function fetchWeekTarget(weekStart: string): Promise<WeekTarget | null> {
  const response = await apiFetch(`/api/week-targets/${weekStart}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new ApiError(`Loading this week's target failed (${response.status}).`, response.status);
  }
  return parsed(response, isWeekTarget, 'a week target');
}

// "Apply to weekly goal": overwrite the current week's target. The server
// refuses anything but the current week.
export async function putWeekTarget(weekStart: string, targetKm: number): Promise<WeekTarget> {
  const response = await putJson(`/api/week-targets/${weekStart}`, { targetKm });
  if (!response.ok) {
    throw new ApiError(`Applying the weekly goal failed (${response.status}).`, response.status);
  }
  return parsed(response, isWeekTarget, 'a week target');
}
