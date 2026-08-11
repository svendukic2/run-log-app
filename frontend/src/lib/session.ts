'use client';

// Real authentication (RUN-58). The v1 "the device is the account" bridge
// (RUN-48) is gone: identity now comes from the Sign in / Sign up screens,
// and `runlog.session` stores ONLY the JWT and the account email - never a
// password. There is no silent re-authentication: the backend has no
// refresh endpoint (RUN-74), so an expired or invalid token signs the user
// out cleanly and lands them on Sign in instead of leaving broken screens
// behind (RUN-58 AC6).
import { ROUTES } from './routes';

const SESSION_KEY = 'runlog.session';

// One knob for every API call: a request that hangs (accepted socket, dead
// server, flaky mobile link) must become a visible error, not an eternal
// 'loading'. window.setTimeout (not AbortSignal.timeout) so jest's fake
// timers control it in tests.
export const API_TIMEOUT_MS = 8000;

interface StoredSession {
  email: string;
  token: string;
}

// Thrown for every failed API interaction; callers show `message` as the
// inline error line (the app-wide error pattern decided in RUN-48).
// `terminal` marks failures no retry can fix: the screen-level error card
// drops its "Try again" for those instead of offering a button that lies.
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
export const WRONG_CREDENTIALS_MESSAGE = 'Wrong email or password.';
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Sign in again.';

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
// localStorage is only its persistence. With blocked or full storage
// (Safari private mode) the memory copy alone cannot survive the full-load
// navigation every auth transition performs, so the Sign in / Sign up
// screens check sessionPersistenceDegraded() and show an inline error
// INSTEAD of navigating - a silent bounce back to Sign in would look like
// wrong credentials forever.
let memorySession: StoredSession | null = null;
let persistenceFailed = false;

// True when the session could not be written to localStorage: it would not
// survive the post-auth page load. Checked by the auth screens before they
// navigate; also surfaced by the runs UI as a warning.
export function sessionPersistenceDegraded(): boolean {
  return persistenceFailed;
}

export const STORAGE_BLOCKED_MESSAGE =
  "Your browser is blocking site storage, so the sign-in can't be kept. Allow storage for this site (or leave private browsing) and try again.";

function readSession(): StoredSession | null {
  if (memorySession) return memorySession;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession & { password?: unknown };
    if (
      typeof parsed?.email !== 'string' ||
      parsed.email.length === 0 ||
      typeof parsed.token !== 'string' ||
      parsed.token.length === 0
    ) {
      return null;
    }
    // A pre-RUN-58 device session: it carries the device secret in
    // plaintext, and its account has a password its user never knew, so
    // "staying signed in" would only postpone a permanent lock-out to the
    // token's expiry. Purge it - signed out with a working Sign up beats
    // signed in with a time bomb.
    if ('password' in parsed || parsed.email.endsWith('@device.runlog')) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const shaped: StoredSession = { email: parsed.email, token: parsed.token };
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

function clearSession(): void {
  memorySession = null;
  persistenceFailed = false;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Blocked storage: the memory copy is gone, which signs this tab out;
    // a stale key without its tab is unreadable noise, not a session.
  }
}

// Whether someone is signed in. Route guards read this synchronously; the
// stores use it to answer a signed-out visitor without touching the network.
export function hasStoredSession(): boolean {
  return typeof window !== 'undefined' && readSession() !== null;
}

// Every auth transition navigates with a FULL page load, not a router push,
// on purpose: the stores keep their caches in module state, and whatever
// they settled to under the PREVIOUS identity (signed out, or someone else)
// must not survive into the next one - a page load is the one broom
// guaranteed to sweep all of them. Swappable for tests because jsdom cannot
// navigate.
let hardNavigate: (path: string) => void = (path) => {
  window.location.assign(path);
};

export function __setHardNavigateForTests(navigate: (path: string) => void): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__setHardNavigateForTests is not available in production');
  }
  hardNavigate = navigate;
}

// Where the Sign in / Sign up pages send the user AFTER authenticating:
// the landing route or the setup steps, via the full-load broom above.
export function navigateAfterAuth(path: string): void {
  hardNavigate(path);
}

function navigateToSignIn(): void {
  hardNavigate(ROUTES.signIn);
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
async function postAuth(path: string, body: unknown): Promise<Response> {
  return timedFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// The backend's validation errors arrive as { message: string | string[] };
// the first line is enough for an inline form error.
async function bodyMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message[0] ?? null;
    return typeof body.message === 'string' ? body.message : null;
  } catch {
    return null;
  }
}

export interface SignUpInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

// Sign up (RUN-58 AC2). On success the session is stored and the caller
// routes into the goal/level setup steps.
export async function signUp(input: SignUpInput): Promise<void> {
  const response = await postAuth('/api/auth/signup', input);
  if (!response.ok) {
    if (response.status === 409) {
      throw new ApiError('An account with this email already exists. Sign in instead.', 409);
    }
    throw new ApiError(
      (await bodyMessage(response)) ?? `Creating the account failed (${response.status}).`,
      response.status,
    );
  }
  const body = (await response.json()) as { token: string };
  writeSession({ email: input.email.trim().toLowerCase(), token: body.token });
}

// Sign in (RUN-58 AC3/AC4). A 401 is the one deliberately vague error: the
// screen must not hint whether the email or the password was wrong.
export async function signIn(email: string, password: string): Promise<void> {
  const response = await postAuth('/api/auth/login', { email, password });
  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError(WRONG_CREDENTIALS_MESSAGE, 401);
    }
    throw new ApiError(`Signing in failed (${response.status}).`, response.status);
  }
  const body = (await response.json()) as { token: string };
  writeSession({ email: email.trim().toLowerCase(), token: body.token });
}

// Sign out (RUN-58 AC5): clear the session and land on Sign in via a full
// page load, which also drops every module-level store cache.
export function signOut(): void {
  clearSession();
  navigateToSignIn();
}

// An expired or invalid token discovered mid-request (AC6). Same broom as
// signOut; the thrown error is terminal so anything that renders before the
// navigation lands does not offer a retry that cannot work.
function handleExpiredSession(): ApiError {
  clearSession();
  navigateToSignIn();
  return new ApiError(SESSION_EXPIRED_MESSAGE, 401, true);
}

// The app-wide way to call the API (RUN-48): same-origin /api/* (proxied to
// the backend by next.config.ts) with the Bearer token attached. A 401
// signs out cleanly - there is no refresh endpoint to retry against.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = readSession();
  if (!session) throw handleExpiredSession();
  const response = await timedFetch(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${session.token}` },
  });
  if (response.status === 401) throw handleExpiredSession();
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
}
