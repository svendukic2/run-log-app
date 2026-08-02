// Local persistence for onboarding. Run Log has no accounts: the profile
// lives in localStorage only ("your runs stay on this device").
import { useSyncExternalStore } from 'react';
import { ROUTES } from './routes';

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
}

const PROFILE_KEY = 'runlog.profile';
const ONBOARDING_COMPLETE_KEY = 'runlog.onboardingComplete';

export function getProfile(): Profile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// Storage-backed hook that is safe during SSR/hydration: the server snapshot
// is always null and clients pick up the stored profile right after mount.
function subscribeToStorage(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
}

export function useProfile(): Profile | null {
  const raw = useSyncExternalStore(
    subscribeToStorage,
    () => window.localStorage.getItem(PROFILE_KEY),
    () => null,
  );
  try {
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function isOnboardingComplete(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
}

export function markOnboardingComplete(): void {
  window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
}

// Where a visitor belongs when the app opens (RUN-13 AC1): the Dashboard once
// onboarding is finished, the unfinished setup step when a profile exists, and
// the Welcome screen on a first launch.
export function resolveLandingRoute(): string {
  if (isOnboardingComplete()) return ROUTES.dashboard;
  return getProfile() ? ROUTES.setupGoal : ROUTES.welcome;
}

// The landing route can only be known on the client, so like useProfile the
// server snapshot is null and the real answer arrives right after hydration.
// Callers should render nothing while it is null rather than guess.
export function useLandingRoute(): string | null {
  return useSyncExternalStore(subscribeToStorage, resolveLandingRoute, () => null);
}
