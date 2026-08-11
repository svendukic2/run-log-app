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

// The full per-account profile, exactly the GET/PUT /api/profile contract.
export interface ProfileRecord {
  firstName: string;
  lastName: string;
  email: string;
  runningLevel: RunningLevel;
  defaultWeeklyGoalKm: number;
}

export interface WeekTarget {
  weekStart: string;
  targetKm: number;
}

function isProfileRecord(body: unknown): body is ProfileRecord {
  const record = body as ProfileRecord;
  return (
    typeof record?.firstName === 'string' &&
    typeof record.lastName === 'string' &&
    typeof record.email === 'string' &&
    (RUNNING_LEVELS as readonly string[]).includes(record.runningLevel) &&
    typeof record.defaultWeeklyGoalKm === 'number'
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

function putJson(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
