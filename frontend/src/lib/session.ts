'use client';

// Device session for the API (RUN-48). The v1 design promises "No password
// needed - your runs stay on this device" (WEL-4) and draws no login screen,
// while the backend (RUN-56/57) requires a Bearer token on every endpoint.
// This module reconciles the two: the DEVICE is the account. The identity is
// minted lazily - never on a page view, only when something actually has to
// reach the server (a write, or a read for a device that already has an
// account) - so crawlers, previews and incognito visits create nothing.
//
// SECURITY TRADE-OFF, stated plainly: `runlog.session` holds the device
// secret alongside the token. Theft of that key is PERMANENT account
// compromise - unlike the 7-day token, the secret mints fresh tokens forever
// and there is no password-change or revocation UI. It is kept anyway
// because the alternative (token only) would strand the account at every
// expiry: the backend has no refresh endpoint, and a design with no login
// screen has no way to ask the user back in. The exposure is bounded by
// what the account contains (this device's runs) and dies with RUN-50, when
// onboarding moves to the API and identity gets designed properly. Do not
// copy this pattern anywhere a human-chosen password or shared account is
// involved.
import { getOnboardingDraft, readLegacyProfile } from './onboardingDraft';

const SESSION_KEY = 'runlog.session';

// One knob for every API call: a request that hangs (accepted socket, dead
// server, flaky mobile link) must become a visible error, not an eternal
// 'loading'. window.setTimeout (not AbortSignal.timeout) so jest's fake
// timers control it in tests.
export const API_TIMEOUT_MS = 8000;

interface StoredSession {
  email: string;
  password: string;
  token: string | null;
}

// Thrown for every failed API interaction; callers show `message` as the
// inline error line (the app-wide error pattern decided in RUN-48).
// `terminal` marks failures no retry can fix (this device's identity cannot
// authenticate): the screen-level error card drops its "Try again" for
// those instead of offering a button that lies.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly terminal: boolean = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const CONNECTION_MESSAGE =
  "Couldn't reach the server. Check that the backend is running, then try again.";
const TIMEOUT_MESSAGE = 'The server took too long to respond. Try again in a moment.';

// The one inline-error fallback for awaited mutations (the app-wide error
// pattern): a named error explains itself, anything else gets this line.
// Shared here next to ApiError so the user-facing copy exists once instead
// of drifting across every form and card that catches.
export function mutationErrorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Saving failed. Check that you're online and try again.";
}

// The in-memory session is the source of truth for this page load;
// localStorage is only its persistence. This ordering is what keeps a
// browser with blocked or full storage (Safari private mode, third-party
// embeds) on ONE identity for the whole tab instead of minting a fresh
// account per request - there, only durability degrades: a reload loses the
// session, which sessionPersistenceDegraded() lets the UI warn about.
let memorySession: StoredSession | null = null;
let persistenceFailed = false;

// True when the session could not be written to localStorage: the account
// works for this tab but will be unreachable after a reload. Surfaced by
// the runs UI as a warning, not silently accepted.
export function sessionPersistenceDegraded(): boolean {
  return persistenceFailed;
}

// A stored session must look like something mintCredentials() produced:
// non-empty credentials on the device-account domain. Anything else is
// corruption, not an identity that could own data, and treating it as
// authoritative would brick authentication forever (empty credentials can
// neither log in nor sign up). Corruption reads as "no session".
function isPlausibleSession(session: StoredSession): boolean {
  return (
    session.email.length > 0 &&
    session.email.endsWith('@device.runlog') &&
    session.password.length > 0
  );
}

function readSession(): StoredSession | null {
  if (memorySession) return memorySession;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const session = parsed as StoredSession;
    if (typeof session?.email !== 'string' || typeof session.password !== 'string') return null;
    const shaped: StoredSession = {
      email: session.email,
      password: session.password,
      token: typeof session.token === 'string' ? session.token : null,
    };
    if (!isPlausibleSession(shaped)) return null;
    memorySession = shaped;
    return shaped;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession): void {
  memorySession = session;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    persistenceFailed = false;
  } catch {
    persistenceFailed = true;
  }
}

// Whether this device already has an account. The runs store uses this to
// skip the network entirely on devices that never wrote anything: a fresh
// browser's run log is empty by definition, and asking the server would
// require creating an account as a side effect of a page view.
export function hasStoredSession(): boolean {
  return typeof window !== 'undefined' && readSession() !== null;
}

// fetch with the app-wide timeout. The caught value decides the message:
// our own abort is a timeout, fetch's TypeError is connectivity, and
// anything else is a bug in the calling code that must not hide behind a
// network error for a week.
async function timedFetch(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(path, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(TIMEOUT_MESSAGE);
    }
    if (error instanceof TypeError) {
      throw new ApiError(CONNECTION_MESSAGE);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

// One request helper for the auth endpoints, the only calls made WITHOUT a
// token.
function postJson(path: string, body: unknown): Promise<Response> {
  return timedFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function mintCredentials(): StoredSession {
  return {
    // Unique by construction, so signup can never 409 against a real
    // address; the profile's human email stays a profile field (RUN-50).
    email: `runner-${randomHex(8)}@device.runlog`,
    password: randomHex(24),
    token: null,
  };
}

// Signup wants non-empty names (WEL-5 rules). They come from the leaf
// onboardingDraft module (never from the profile STORE, which sits above
// this module in the import graph): the wizard draft is where names live
// at the common minting moment ("Finish setup"), and the not-yet-imported
// v1 profile key covers legacy devices whose first server contact is the
// runs import. The fallback covers a re-signup after a database reset with
// clean local state - the profile PUT restores the real names right after.
function signupNames(): { firstName: string; lastName: string } {
  const names = getOnboardingDraft().profile ?? readLegacyProfile();
  return {
    firstName: names?.firstName.trim() || 'Runner',
    lastName: names?.lastName.trim() || 'Device',
  };
}

async function authenticate(session: StoredSession): Promise<StoredSession> {
  // Login first: the common case after token expiry (7d) is an existing
  // account.
  const login = await postJson('/api/auth/login', {
    email: session.email,
    password: session.password,
  });
  if (login.ok) {
    const body = (await login.json()) as { token: string };
    return { ...session, token: body.token };
  }

  // 401 here means the account is gone (database reset): re-mint it under
  // the SAME device credentials, never fresh ones - regenerating would
  // abandon whatever the stored identity still owns and dress the data loss
  // up as recovery. A 4xx on that signup (409: the email exists with a
  // different password) is therefore TERMINAL for this device identity, and
  // is marked so the error card stops offering a retry that cannot work.
  if (login.status !== 401) {
    throw new ApiError(`Signing in failed (${login.status}).`, login.status);
  }
  const signup = await postJson('/api/auth/signup', {
    email: session.email,
    password: session.password,
    ...signupNames(),
  });
  if (!signup.ok) {
    const terminal = signup.status >= 400 && signup.status < 500;
    throw new ApiError(
      terminal
        ? `This device's saved sign-in no longer matches its account (${signup.status}).`
        : `Creating the device account failed (${signup.status}).`,
      signup.status,
      terminal,
    );
  }
  const body = (await signup.json()) as { token: string };
  return { ...session, token: body.token };
}

// Concurrent callers (several cards load at once) share one in-flight
// authentication instead of racing signup against itself.
let pending: Promise<string> | null = null;

async function ensureToken(forceRefresh = false): Promise<string> {
  // A refresh must never join an older in-flight authentication: that one
  // may resolve to exactly the stale token the caller is refreshing away,
  // burning the single 401 retry. Invalidate before joining.
  if (forceRefresh) pending = null;
  if (!pending) {
    pending = (async () => {
      let session = readSession() ?? mintCredentials();
      if (forceRefresh) session = { ...session, token: null };
      if (!session.token) {
        session = await authenticate(session);
        // Another tab may have minted its own identity while this one was
        // authenticating; last-writer-wins here would strand that tab's
        // account with its runs forever. Adopt the other tab's session
        // instead of overwriting it. Known cost: this tab's signup already
        // went through, so a genuine race leaves one empty orphaned account
        // on the server - an empty new account is cheaper than a lost
        // populated one.
        memorySession = null; // re-read the key, not our own cache
        const concurrent = readSession();
        if (concurrent && concurrent.email !== session.email && concurrent.token) {
          return concurrent.token;
        }
        writeSession(session);
      }
      if (!session.token) throw new ApiError('No token after authentication.');
      return session.token;
    })();
    // The next caller after a failure must retry, not inherit the rejection.
    pending.catch(() => {
      pending = null;
    });
  }
  const token = await pending;
  pending = null;
  return token;
}

// The app-wide way to call the API (RUN-48): same-origin /api/* (proxied to
// the backend by next.config.ts), Bearer token attached, one silent
// re-authentication and retry when the token turns out to be expired.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const request = (token: string) =>
    timedFetch(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });

  let response = await request(await ensureToken());
  if (response.status === 401) {
    response = await request(await ensureToken(true));
  }
  return response;
}

// Test-only: clears the in-memory session state, which outlives the
// per-test localStorage wipe and would otherwise leak identities (and their
// invalidated tokens) between tests.
export function __resetSessionForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetSessionForTests is not available in production');
  }
  memorySession = null;
  persistenceFailed = false;
  pending = null;
}
