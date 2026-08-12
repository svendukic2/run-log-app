// Real authentication (RUN-58): what signIn/signUp store, how failures
// surface, and how apiFetch handles the token lifecycle. The shared mock
// from src/test/runsApiMock (installed by jest.setup.ts before every test)
// plants a signed-in session by default and serves the auth endpoints, so
// these tests assert against it; the signed-out paths start from
// clearTestSession().
import {
  breakRunsAuth,
  clearTestSession,
  expireRunsAccessTokens,
  expireRunsTokens,
  signInRedirectCount,
} from '@/test/runsApiMock';
import {
  ApiError,
  apiFetch,
  hasStoredSession,
  SESSION_EXPIRED_MESSAGE,
  signIn,
  signOut,
  signUp,
  WRONG_CREDENTIALS_MESSAGE,
} from './session';

function storedSession(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem('runlog.session');
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

function fetchCalls(): Array<[string, RequestInit?]> {
  return (global.fetch as jest.Mock).mock.calls as Array<[string, RequestInit?]>;
}

describe('signIn / signUp (RUN-58)', () => {
  it('signIn stores the email and token - and never a password', async () => {
    clearTestSession();

    await signIn('User@Example.com', 'hunter2secret');

    // Exactly {email, token}: the email normalized, the token the server's,
    // and no password field anywhere near storage.
    expect(storedSession()).toEqual({
      email: 'user@example.com',
      token: expect.any(String),
    });
    expect(storedSession()).not.toHaveProperty('password');
    expect(hasStoredSession()).toBe(true);
  });

  it('purges a leftover v1 device session instead of trusting it', () => {
    // Pre-RUN-58 shape: a plaintext device secret and an account whose
    // password its user never knew. Keeping it signed in would only
    // postpone a permanent lock-out to the token's expiry.
    clearTestSession();
    window.localStorage.setItem(
      'runlog.session',
      JSON.stringify({ email: 'runner-abc@device.runlog', password: 'device-secret', token: 't' }),
    );

    expect(hasStoredSession()).toBe(false);
    expect(window.localStorage.getItem('runlog.session')).toBeNull();
  });

  it('signIn rejects wrong credentials with the deliberately vague message', async () => {
    clearTestSession();
    breakRunsAuth();

    await expect(signIn('user@example.com', 'wrong')).rejects.toThrow(WRONG_CREDENTIALS_MESSAGE);
    // No session was stored for an identity that failed to authenticate.
    expect(hasStoredSession()).toBe(false);
  });

  it('signUp stores the session so the caller can route into setup', async () => {
    clearTestSession();

    await signUp({
      firstName: 'Ana',
      lastName: 'Anić',
      email: 'Ana@Example.com',
      password: 'hunter2secret',
    });

    expect(storedSession()).toEqual({
      email: 'ana@example.com',
      token: expect.any(String),
    });
    expect(storedSession()).not.toHaveProperty('password');
  });

  it('signUp surfaces a 409 as "this email already has an account"', async () => {
    clearTestSession();
    breakRunsAuth();

    await expect(
      signUp({
        firstName: 'Ana',
        lastName: 'Anić',
        email: 'taken@example.com',
        password: 'hunter2secret',
      }),
    ).rejects.toThrow(/An account with this email already exists/);
    expect(hasStoredSession()).toBe(false);
  });

  it('signOut clears the session and lands on Sign in', async () => {
    // The default test session is planted; signing out must drop it whole.
    expect(hasStoredSession()).toBe(true);

    await signOut();

    // The server is told first (RUN-74), so the token cannot be renewed by
    // anyone who kept a copy; the local clear and the redirect follow.
    expect(fetchCalls().some(([url]) => url === '/api/auth/logout')).toBe(true);
    expect(hasStoredSession()).toBe(false);
    expect(window.localStorage.getItem('runlog.session')).toBeNull();
    expect(signInRedirectCount()).toBe(1);
  });
});

describe('apiFetch (RUN-58 AC6)', () => {
  it('attaches the stored Bearer token and never touches the auth endpoints', async () => {
    const token = storedSession()?.token as string;

    const response = await apiFetch('/api/runs');

    expect(response.ok).toBe(true);
    const [url, init] = fetchCalls()[0];
    expect(url).toBe('/api/runs');
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
    expect(fetchCalls().some(([u]) => u.startsWith('/api/auth/'))).toBe(false);
  });

  it('signs out on a 401: session cleared, redirect fired, terminal error thrown', async () => {
    // A session that renewal cannot save (RUN-74) degrades to exactly the
    // pre-refresh behaviour: a clean sign-out, never a half-broken screen.
    expireRunsTokens();

    const failure = await apiFetch('/api/runs').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe(SESSION_EXPIRED_MESSAGE);
    expect((failure as ApiError).terminal).toBe(true);
    // Renewal was tried exactly once and refused; it is not retried on the
    // way out, which is what keeps a dead session from looping.
    expect(fetchCalls().filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1);
    expect(hasStoredSession()).toBe(false);
    expect(signInRedirectCount()).toBe(1);
  });

  it('treats a missing session the same way, without touching the network', async () => {
    clearTestSession();

    const failure = await apiFetch('/api/runs').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe(SESSION_EXPIRED_MESSAGE);
    expect((failure as ApiError).terminal).toBe(true);
    expect(fetchCalls()).toHaveLength(0);
    expect(signInRedirectCount()).toBe(1);
  });

  it('throws ApiError with a human message when the server is unreachable', async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError('fetch failed'))) as never;

    await expect(apiFetch('/api/runs')).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch('/api/runs')).rejects.toThrow(/Couldn't reach the server/);
  });
});

describe('silent token renewal (RUN-74)', () => {
  it('renews once on a 401 and replays the request with the new token', async () => {
    const stale = storedSession()?.token as string;
    // The guard no longer accepts the token, but the session is alive: the
    // everyday case a fifteen-minute token creates several times a day.
    expireRunsAccessTokens();

    const response = await apiFetch('/api/runs');

    expect(response.ok).toBe(true);
    const fresh = storedSession()?.token as string;
    expect(fresh).not.toBe(stale);
    // Nothing user-visible happened: no sign-out, no redirect.
    expect(hasStoredSession()).toBe(true);
    expect(signInRedirectCount()).toBe(0);
    // First the 401, then the renewal, then the replay carrying the new token.
    expect(fetchCalls().map(([url]) => url)).toEqual([
      '/api/runs',
      '/api/auth/refresh',
      '/api/runs',
    ]);
    const replayHeaders = fetchCalls()[2][1]?.headers as Record<string, string>;
    expect(replayHeaders.Authorization).toBe(`Bearer ${fresh}`);
  });

  it('shares ONE renewal between requests that 401 together', async () => {
    // Several stores read at once on a screen load, so a stale token 401s
    // all of them in the same tick. One renewal, awaited by the rest: N
    // renewals would rotate the token out from under each other and all but
    // one would fail.
    expireRunsAccessTokens();

    const responses = await Promise.all([
      apiFetch('/api/runs'),
      apiFetch('/api/runs'),
      apiFetch('/api/runs'),
    ]);

    expect(responses.every((response) => response.ok)).toBe(true);
    expect(fetchCalls().filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1);
    expect(signInRedirectCount()).toBe(0);
  });
});
