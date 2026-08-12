'use client';

// Real authentication (RUN-58, silent renewal since RUN-74). The v1 "the
// device is the account" bridge (RUN-48) is gone: identity comes from the
// Sign in / Sign up screens, and `runlog.session` stores ONLY the JWT and
// the account email - never a password.
//
// The token now lives fifteen minutes and renews itself: a 401 sends
// apiFetch to POST /api/auth/refresh once and replays the request with the
// new token. The server-side rules that bound the renewing (an idle window,
// an absolute session ceiling, and a revocation version bumped by logout)
// are documented in backend/src/auth/token-lifecycle.ts and are deliberately
// not mirrored here - the client's whole job is "try once, and if that
// fails, sign out".
//
// When the renewal DOES fail, the behaviour is exactly what it was before
// RUN-74 and RUN-58 AC6 is still the contract: clear the session, hard-load
// Sign in, throw a terminal ApiError so nothing offers a retry that cannot
// work. There is no state in between.
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

// Keeps the stored email in step with a Settings rename (RUN-59): it is the
// address the user will type at the next Sign in, so a stale copy here would
// be a second, wrong truth. No-op when signed out.
export function updateSessionEmail(email: string): void {
  const session = readSession();
  if (!session) return;
  writeSession({ ...session, email });
}

function clearSession(): void {
  memorySession = null;
  persistenceFailed = false;
  // Whatever that renewal resolves to belongs to the session being ended.
  // performRefresh also refuses to write once the session is gone, so this
  // is the second of two locks on the same door.
  refreshInFlight = null;
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

// Sign out (RUN-58 AC5, server-side since RUN-74): tell the backend to
// revoke the session, then clear locally and land on Sign in via a full page
// load, which also drops every module-level store cache.
//
// Awaited rather than fired and forgotten, because the hard navigation on
// the next line cancels in-flight requests: a fire-and-forget logout would
// reach the server only sometimes, which is worse than not having one. The
// cost is that a dead backend makes the button take up to API_TIMEOUT_MS.
// The revoke never throws and the local sign-out happens either way, so an
// unreachable server still signs the user out of this browser - it just
// leaves the outstanding token renewable, which is the honest outcome when
// we could not reach the only thing that can revoke it.
export async function signOut(): Promise<void> {
  const session = readSession();
  if (session) await revokeSession(session.token);
  clearSession();
  navigateToSignIn();
}

// Best effort by design: the endpoint answers 204 to anything, and the one
// thing this must never do is stop the user signing out.
async function revokeSession(token: string): Promise<void> {
  try {
    await timedFetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Offline, timed out, backend down. Handled by signing out locally.
  }
}

// An expired or invalid token discovered mid-request (AC6). Same broom as
// signOut; the thrown error is terminal so anything that renders before the
// navigation lands does not offer a retry that cannot work.
function handleExpiredSession(): ApiError {
  clearSession();
  navigateToSignIn();
  return new ApiError(SESSION_EXPIRED_MESSAGE, 401, true);
}

// The single renewal in flight, if any. Several stores read at once and a
// stale token 401s all of them within the same tick; without this they would
// fire one refresh each, and since every refresh rotates the token, all but
// one of those would be racing against a token their sibling just replaced.
// One promise, everyone else awaits it. Same shape as the load-token guards
// in eventParticipants.ts and friends.
let refreshInFlight: Promise<string | null> | null = null;

// Exchanges the stored token for a fresh one. Resolves to the new token, or
// to null for every kind of failure - a rejection here would surface as a
// mysterious error from whichever unlucky request triggered the renewal,
// when the only meaningful outcome is "could not renew, so sign out".
async function performRefresh(token: string): Promise<string | null> {
  try {
    const response = await timedFetch('/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      token?: unknown;
      user?: { email?: unknown };
    };
    if (typeof body.token !== 'string' || body.token.length === 0) return null;
    // Re-read rather than trusting the session we started with: a sign-out
    // (or another 401's sign-out) may have landed while this was in flight,
    // and writing here would resurrect the session the user just ended - the
    // hard navigation would then reload straight back into it.
    const existing = readSession();
    if (!existing) return null;
    // The response carries the account's current email, so a rename made in
    // another tab lands here too; falling back to the stored one keeps the
    // session writable if the shape ever changes.
    const email =
      typeof body.user?.email === 'string' && body.user.email.length > 0
        ? body.user.email
        : existing.email;
    writeSession({ email, token: body.token });
    return body.token;
  } catch {
    return null;
  }
}

// Returns a usable token, or null if the session is over.
async function renewToken(staleToken: string): Promise<string | null> {
  const current = readSession();
  if (!current) return null;
  // Someone already renewed while this request was in flight. Reuse their
  // token rather than spending another refresh - and rotating away the one
  // every other caller is about to use.
  if (current.token !== staleToken) return current.token;

  if (!refreshInFlight) {
    const attempt = performRefresh(current.token);
    refreshInFlight = attempt;
    void attempt.finally(() => {
      // Only clear the slot if it is still ours: a later renewal may have
      // claimed it after this one settled.
      if (refreshInFlight === attempt) refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// The app-wide way to call the API (RUN-48): same-origin /api/* (proxied to
// the backend by next.config.ts) with the Bearer token attached.
//
// A 401 buys EXACTLY ONE renewal and ONE replay. If the replay 401s too, the
// session is over and we sign out - retrying again would be a loop, and a
// loop against an endpoint that answers 401 is indistinguishable from a
// working session to everything upstream of here. `init` is reused verbatim
// on the replay, which is safe because every caller in this app passes a
// string body or none; a stream body would need reading twice and does not
// exist here.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = readSession();
  if (!session) throw handleExpiredSession();

  const response = await sendWithToken(path, init, session.token);
  if (response.status !== 401) return response;

  const renewed = await renewToken(session.token);
  if (!renewed) throw handleExpiredSession();

  const replay = await sendWithToken(path, init, renewed);
  if (replay.status === 401) throw handleExpiredSession();
  return replay;
}

function sendWithToken(path: string, init: RequestInit, token: string): Promise<Response> {
  return timedFetch(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
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
  // A renewal left over from the previous test would otherwise resolve into
  // the next one and hand it a token from an identity it never had.
  refreshInFlight = null;
}
