'use client';

// The onboarding wizard's local state: the weekly goal a user picked on the
// first setup step but has not finished setup with yet. A LEAF module, kept
// below the stores in the import graph so forms and stores alike can read it
// directly.
//
// Since RUN-59 the draft holds NOTHING identity-shaped: name and email live
// on the account from signup onwards (account.ts), which is what lets setup
// resume on any device after signing in. The goal stays local because it is
// a genuine half-answer - there is no server row for "the number I was
// scrolling before I closed the tab", and inventing one would create a goal
// the runner never confirmed.
import { type Goal } from './goalMath';

const DRAFT_KEY = 'runlog.onboardingDraft';

export interface OnboardingDraft {
  goal?: Goal;
}

// Memory-first like the session: blocked storage (private mode) costs draft
// durability across reloads, never the current wizard walk. Only
// writeOnboardingDraft assigns this - the getter never caches, so a
// hand-edited key stays visible and nothing writes module state during a
// render.
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
// copy keeps this tab's wizard alive either way.
export function writeOnboardingDraft(draft: OnboardingDraft): boolean {
  memoryDraft = draft;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function saveDraftGoal(goal: Goal): void {
  writeOnboardingDraft({ ...getOnboardingDraft(), goal });
}

export function clearOnboardingDraft(): void {
  memoryDraft = null;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do: the memory copy is gone and a stale key reads as a
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
