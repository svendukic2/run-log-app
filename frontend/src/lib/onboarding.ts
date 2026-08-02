// Local persistence for onboarding. Run Log has no accounts: the profile
// lives in localStorage only ("your runs stay on this device").

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

export function isOnboardingComplete(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
}

export function markOnboardingComplete(): void {
  window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
}
