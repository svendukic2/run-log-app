'use client';

// The onboarding wizard's local state: the half-finished answers of a
// visitor still walking the setup steps, plus the reader for the v1
// runlog.profile key. A LEAF module on purpose - session.ts needs the
// draft (signup wants real names when it has them, WEL-5) and sits below
// the profile store in the import graph, so the draft lives where both can
// import it directly. No mutable registration, no import-order dependence.
//
// The draft is local-only BY DESIGN: no server account exists until
// "Finish setup" (onboarding.ts#finishOnboarding), so an abandoned wizard
// costs nothing server-side. It dies the moment the finish lands.
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

// The v1 profile key, read here because it is the signup-names fallback for
// v1 devices whose import has not run yet (session.ts) as well as the
// import's own input (onboarding.ts). Trimmed; wrong shapes read as absent.
const LEGACY_PROFILE_KEY = 'runlog.profile';

export function readLegacyProfile(): Profile | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Profile;
    if (
      typeof parsed?.firstName !== 'string' ||
      typeof parsed.lastName !== 'string' ||
      typeof parsed.email !== 'string'
    ) {
      return null;
    }
    return {
      firstName: parsed.firstName.trim(),
      lastName: parsed.lastName.trim(),
      email: parsed.email.trim(),
    };
  } catch {
    return null;
  }
}

// Test-only: the draft's memory copy outlives a per-test localStorage wipe.
export function __resetOnboardingDraftForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetOnboardingDraftForTests is not available in production');
  }
  memoryDraft = null;
}
