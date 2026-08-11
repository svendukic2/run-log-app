'use client';

// The privacy store (RUN-64). The three toggles live on the account in
// PostgreSQL behind GET/PUT /api/privacy; this module holds an in-memory
// cache of them following the app-wide pattern decided in RUN-48 (see
// docs/data-model.md, "The frontend API pattern"), so the Settings card
// reads them synchronously through usePrivacy().
//
// Per ACCOUNT, not per device: every auth transition is a full page load
// (session.ts), which is what sweeps this module-level cache, so one
// browser signing in as someone else can never show the previous
// account's settings. There is deliberately no reset-on-signout logic
// here for the same reason.
//
// The defaults below are the frontend's copy of a promise the SERVER
// keeps (@default(false) on each column): they are what the card renders
// before the first load lands, never what gets saved on the user's behalf.
import { useSyncExternalStore } from 'react';
import { fetchPrivacy, putPrivacy, type PrivacySettings } from './accountApi';
import { ApiError, hasStoredSession } from './session';

export { type PrivacySettings };

// Private on every count, the decided default (AC3). Frozen so a caller
// cannot mutate the shared object into a laxer default.
export const PRIVACY_DEFAULTS: PrivacySettings = Object.freeze({
  profilePublic: false,
  showOnLeaderboard: false,
  showRoutes: false,
});

const PRIVACY_CHANGED_EVENT = 'runlog:privacy-changed';

export type PrivacyStatus = 'loading' | 'ready' | 'error';

export interface PrivacyError {
  message: string;
  terminal: boolean;
}

interface PrivacySnapshot {
  status: PrivacyStatus;
  settings: PrivacySettings;
  error: PrivacyError | null;
}

const INITIAL_SNAPSHOT: PrivacySnapshot = Object.freeze({
  status: 'loading' as const,
  settings: PRIVACY_DEFAULTS,
  error: null,
});

let snapshot: PrivacySnapshot = INITIAL_SNAPSHOT;
let loadStarted = false;
let loadInFlight = false;

function publish(next: PrivacySnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(PRIVACY_CHANGED_EVENT));
}

function toPrivacyError(error: unknown): PrivacyError {
  if (error instanceof ApiError) {
    return { message: error.message, terminal: error.terminal };
  }
  return { message: 'Something went wrong loading your privacy settings.', terminal: false };
}

async function loadPrivacy(): Promise<void> {
  if (loadInFlight) return;
  loadInFlight = true;
  publish({ status: 'loading', settings: snapshot.settings, error: null });
  try {
    // Same lazy rule as the other stores: signed out means no account to
    // have settings for, answered without a doomed request.
    if (!hasStoredSession()) {
      publish({ status: 'ready', settings: PRIVACY_DEFAULTS, error: null });
      return;
    }
    const settings = await fetchPrivacy();
    publish({ status: 'ready', settings, error: null });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Loading the privacy settings failed', error);
    }
    // The cached settings survive an error so the card keeps showing the
    // last known truth rather than flashing the defaults, which would
    // read as "everything just went private".
    publish({ status: 'error', settings: snapshot.settings, error: toPrivacyError(error) });
  } finally {
    loadInFlight = false;
  }
}

// The retry handle for the boundary's "Try again".
export function reloadPrivacy(): void {
  void loadPrivacy();
}

function subscribeToPrivacy(onStoreChange: () => void): () => void {
  if (!loadStarted) {
    loadStarted = true;
    void loadPrivacy();
  }
  window.addEventListener(PRIVACY_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(PRIVACY_CHANGED_EVENT, onStoreChange);
  };
}

function usePrivacySnapshot(): PrivacySnapshot {
  return useSyncExternalStore(
    subscribeToPrivacy,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );
}

// The stored settings, synchronously. Behind the app-data boundary this is
// always the account's real state; before the load settles it is the
// private defaults.
export function usePrivacy(): PrivacySettings {
  return usePrivacySnapshot().settings;
}

export function usePrivacyStatus(): PrivacyStatus {
  return usePrivacySnapshot().status;
}

export function usePrivacyError(): PrivacyError | null {
  return usePrivacySnapshot().error;
}

// The Settings save (AC2), awaited and pessimistic like every write since
// RUN-48: the cache only adopts what the server actually stored, so a
// failed save leaves the stored values on screen and the caller shows the
// failure inline. Full replace, so re-sending after a failure is safe.
export async function savePrivacySettings(settings: PrivacySettings): Promise<void> {
  const stored = await putPrivacy(settings);
  publish({ status: 'ready', settings: stored, error: null });
}

// Test-only: puts the module-level cache into a known state without a
// fetch (jest.setup.ts wires this up through src/test/runsApiMock.ts).
// Passing undefined re-arms the initial load; settings prime 'ready'.
export function __resetPrivacyStoreForTests(settings?: PrivacySettings): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetPrivacyStoreForTests is not available in production');
  }
  loadInFlight = false;
  if (settings === undefined) {
    loadStarted = false;
    snapshot = INITIAL_SNAPSHOT;
  } else {
    loadStarted = true;
    snapshot = { status: 'ready', settings, error: null };
  }
}
