// The coach's weekly plan (RUN-32, AIC-3/4). There is no model behind it:
// every number derives deterministically from run history at render time, so
// the card can never show stale or fabricated values, and later runs move the
// plan the way they move every other derived surface. Only the generation
// timestamp persists (runlog.plan): it feeds the "updated {time} ago" caption
// and is the seam RUN-35's Regenerate re-stamps.
import { useMemo, useSyncExternalStore } from 'react';
import { lastWeekStarts, totalsForWeek, type Run } from './runs';

export interface Plan {
  targetKm: number;
  // null when there was no previous-week distance to compare against (the
  // very first plan): the card then shows "New" instead of a percentage.
  vsLastWeekPercent: number | null;
  sessionsMin: number;
  sessionsMax: number;
  keyWorkout: string;
}

const PLAN_KEY = 'runlog.plan';
const PLAN_CHANGED_EVENT = 'runlog:plan-changed';

// The mock's "+10% VS LAST WEEK" read as the rule: a suggested target is last
// week's distance stepped up by ten percent (assumption on the ticket; AIC-4
// defines no formula).
const STEP_FACTOR = 1.1;
// The suggestion never asks for more than a 6-7 day week.
const MAX_SESSIONS_MIN = 6;

export function derivePlan(runs: Run[], goalKm: number, isoToday: string): Plan {
  // lastWeekStarts lists oldest first, so two entries are [previous, current].
  const [previousWeek, currentWeek] = lastWeekStarts(isoToday, 2);
  const lastWeek = totalsForWeek(runs, previousWeek);
  const thisWeek = totalsForWeek(runs, currentWeek);

  // No previous-week distance to build on (including a logged 0 km week):
  // the weekly goal is the starting target.
  const targetKm =
    lastWeek.distanceKm > 0
      ? Math.max(1, Math.round(lastWeek.distanceKm * STEP_FACTOR))
      : Math.max(1, Math.round(goalKm));

  // Recomputed from the rounded target rather than echoing the step factor,
  // so the stat can never claim a step the headline does not deliver: a 3 km
  // week rounds to a 3 km target and honestly reads +0%, and a 0.5 km week
  // reads the +100% its 1 km floor actually is.
  const vsLastWeekPercent =
    lastWeek.distanceKm > 0
      ? Math.round(((targetKm - lastWeek.distanceKm) / lastWeek.distanceKm) * 100)
      : null;

  // Suggested sessions bracket how often the runner actually runs: last
  // week's count when any run exists there, this week's otherwise, at least
  // one and never more than a 6-7 bracket.
  const referenceSessions =
    lastWeek.runCount > 0 ? lastWeek.runCount : Math.max(1, thisWeek.runCount);
  const sessionsMin = Math.min(MAX_SESSIONS_MIN, referenceSessions);

  return {
    targetKm,
    vsLastWeekPercent,
    sessionsMin,
    sessionsMax: sessionsMin + 1,
    // One quality session per week is the coach's fixed suggestion (AIC-4).
    keyWorkout: '1 tempo',
  };
}

// "just now" under a minute, then minutes, hours, days.
export function formatUpdatedAgo(generatedAt: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - generatedAt) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* Generation timestamp store --------------------------------------------- */

// localStorage is user-writable, so the stamp is verified before the caption
// does arithmetic with it. Anything malformed reads as "never generated".
function parseGeneratedAt(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const at = (parsed as { generatedAt?: unknown })?.generatedAt;
    return typeof at === 'number' && Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

export function getPlanGeneratedAt(): number | null {
  if (typeof window === 'undefined') return null;
  return parseGeneratedAt(window.localStorage.getItem(PLAN_KEY));
}

// Stamps when the plan was (re)generated: the A16 first-visit marker now,
// RUN-35's Regenerate later. setItem can throw (quota, private browsing);
// the plan itself derives from runs, so a failed stamp costs only the
// caption's accuracy, never the card.
export function stampPlanGenerated(now: number): void {
  try {
    window.localStorage.setItem(PLAN_KEY, JSON.stringify({ generatedAt: now }));
    window.dispatchEvent(new Event(PLAN_CHANGED_EVENT));
  } catch {
    // Nothing to recover; the card falls back to "just now".
  }
}

function subscribeToPlan(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(PLAN_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(PLAN_CHANGED_EVENT, onStoreChange);
  };
}

function getPlanSnapshot(): string | null {
  return window.localStorage.getItem(PLAN_KEY);
}

function getServerSnapshot(): null {
  return null;
}

// Storage-backed hook, SSR-safe like useRuns. The parse is memoised on the
// string snapshot so consumers' effects can depend on the value without
// re-running every render.
export function usePlanGeneratedAt(): number | null {
  const raw = useSyncExternalStore(subscribeToPlan, getPlanSnapshot, getServerSnapshot);
  return useMemo(() => parseGeneratedAt(raw), [raw]);
}
