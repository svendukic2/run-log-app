'use client';

// The onboarding wizard's local state: the answers of a user still walking
// the setup steps. A LEAF module on purpose, kept below the stores in the
// import graph so forms and stores alike can read the draft directly.
// Seeded by Sign up (names/email, RUN-58), grown by the goal step, consumed
// by "Finish setup" (onboarding.ts#finishOnboarding), which turns it into
// the account's records and deletes it.
//
// The draft is local-only BY DESIGN: abandoning the wizard costs nothing
// server-side beyond the signup-created User row.
import { type Goal } from './goalMath';

// The display subset the forms and the avatar work with; the stored record
// (ProfileRecord in accountApi.ts) additionally carries runningLevel and
// defaultWeeklyGoalKm.
export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
}

const DRAFT_KEY = 'runlog.onboardingDraft';

export interface OnboardingDraft {
  profile?: Profile;
  goal?: Goal;
}

// Memory-first like the session: blocked storage (private mode) costs
// draft durability across reloads, never the current wizard walk. Only
// writeDraft assigns this - the getter never caches, so a hand-edited key
// stays visible and nothing writes module state during a render.
let memoryDraft: OnboardingDraft | null = null;

function parseDraft(raw: string): OnboardingDraft | null {
  try {
    const parsed = JSON.parse(raw) as OnboardingDraft;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getOnboardingDraft(): OnboardingDraft {
  if (memoryDraft) return memoryDraft;
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return (raw ? parseDraft(raw) : null) ?? {};
  } catch {
    return {};
  }
}

// Returns whether the write is DURABLE (landed in localStorage). The memory
// copy keeps this tab's wizard alive either way, but callers that are about
// to delete another copy of the same data (the legacy import) must know the
// difference: deleting the source after a memory-only write would turn a
// reload into data loss.
export function writeOnboardingDraft(draft: OnboardingDraft): boolean {
  memoryDraft = draft;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function saveDraftProfile(profile: Profile): void {
  writeOnboardingDraft({ ...getOnboardingDraft(), profile });
}

export function saveDraftGoal(goal: Goal): void {
  writeOnboardingDraft({ ...getOnboardingDraft(), goal });
}

export function clearOnboardingDraft(): void {
  memoryDraft = null;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do: the memory copy is gone and the stale key reads as a
    // draft only until the profile exists, which now it does.
  }
}

// Test-only: the draft's memory copy outlives a per-test localStorage wipe.
export function __resetOnboardingDraftForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetOnboardingDraftForTests is not available in production');
  }
  memoryDraft = null;
}
