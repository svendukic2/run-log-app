// Importing the onboarding module also registers the signup-names source
// the tests below exercise; session.ts deliberately cannot import it back.
import { saveDraftProfile } from './onboarding';
import { apiFetch, ApiError, sessionPersistenceDegraded } from './session';

// These tests hand-roll their own fetch mock instead of using
// src/test/runsApiMock, because the subject here IS the handshake the shared
// mock waves through: which auth endpoint gets called when, what is stored,
// and how a mid-session 401 recovers.

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Call[] = [];

type Responder = (call: Call) => { status: number; body?: unknown } | undefined;

function installFetch(responder: Responder): void {
  calls = [];
  global.fetch = jest.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: (init.method ?? 'GET').toUpperCase(),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    const result = responder(call) ?? { status: 200, body: {} };
    return Promise.resolve({
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: () => Promise.resolve(result.body ?? {}),
    } as Response);
  }) as unknown as typeof fetch;
}

function authCalls(): Call[] {
  return calls.filter((call) => call.url.startsWith('/api/auth/'));
}

function storedSession(): { email: string; password: string; token: string | null } | null {
  const raw = window.localStorage.getItem('runlog.session');
  return raw ? (JSON.parse(raw) as ReturnType<typeof storedSession>) : null;
}

describe('device session (RUN-48)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('mints a device account on first use: login misses, signup follows, token stored', async () => {
    installFetch((call) => {
      if (call.url === '/api/auth/login') return { status: 401, body: {} };
      if (call.url === '/api/auth/signup') return { status: 201, body: { token: 'fresh-token' } };
      return { status: 200, body: [] };
    });

    const response = await apiFetch('/api/runs');

    expect(response.ok).toBe(true);
    expect(authCalls().map((call) => call.url)).toEqual([
      '/api/auth/login',
      '/api/auth/signup',
    ]);
    const signup = authCalls()[1];
    // Synthetic per-device identity: unique by construction, never the
    // profile's human email, names never empty (signup validates WEL-5).
    expect((signup.body as { email: string }).email).toMatch(/^runner-[0-9a-f]{16}@device\.runlog$/);
    expect((signup.body as { firstName: string }).firstName).not.toHaveLength(0);
    expect((signup.body as { lastName: string }).lastName).not.toHaveLength(0);
    expect(storedSession()?.token).toBe('fresh-token');

    const runsCall = calls.find((call) => call.url === '/api/runs');
    expect(runsCall?.headers.Authorization).toBe('Bearer fresh-token');
  });

  it('signs up with the onboarding draft names when a wizard is underway', async () => {
    // The names source reads the wizard draft first: finishing onboarding is
    // the common moment the device account gets minted (RUN-50).
    saveDraftProfile({ firstName: 'Ana', lastName: 'Anić', email: 'ana@example.com' });
    installFetch((call) => {
      if (call.url === '/api/auth/login') return { status: 401 };
      if (call.url === '/api/auth/signup') return { status: 201, body: { token: 't' } };
      return { status: 200, body: [] };
    });

    await apiFetch('/api/runs');

    const signup = authCalls()[1].body as { firstName: string; lastName: string; email: string };
    expect(signup.firstName).toBe('Ana');
    expect(signup.lastName).toBe('Anić');
    // The human email stays a profile field; the account is the device.
    expect(signup.email).not.toBe('ana@example.com');
  });

  it('signs up with not-yet-imported v1 profile names when no draft exists', async () => {
    // A v1 device can mint its account before the one-time import has moved
    // runlog.profile to the server; the names source falls back to reading
    // that key directly so the signup still carries the real names.
    window.localStorage.setItem(
      'runlog.profile',
      JSON.stringify({ firstName: 'Ana', lastName: 'Anić', email: 'ana@example.com' }),
    );
    installFetch((call) => {
      if (call.url === '/api/auth/login') return { status: 401 };
      if (call.url === '/api/auth/signup') return { status: 201, body: { token: 't' } };
      return { status: 200, body: [] };
    });

    await apiFetch('/api/runs');

    const signup = authCalls()[1].body as { firstName: string; lastName: string };
    expect(signup.firstName).toBe('Ana');
    expect(signup.lastName).toBe('Anić');
  });

  it('reuses a stored token without touching the auth endpoints', async () => {
    window.localStorage.setItem(
      'runlog.session',
      JSON.stringify({ email: 'runner-x@device.runlog', password: 'pw', token: 'stored-token' }),
    );
    installFetch(() => ({ status: 200, body: [] }));

    await apiFetch('/api/runs');

    expect(authCalls()).toHaveLength(0);
    expect(calls[0].headers.Authorization).toBe('Bearer stored-token');
  });

  it('recovers from an expired token: 401 once, silent login, one retry', async () => {
    window.localStorage.setItem(
      'runlog.session',
      JSON.stringify({ email: 'runner-x@device.runlog', password: 'pw', token: 'expired' }),
    );
    installFetch((call) => {
      if (call.url === '/api/auth/login') return { status: 200, body: { token: 'renewed' } };
      if (call.headers.Authorization === 'Bearer expired') return { status: 401 };
      return { status: 200, body: [] };
    });

    const response = await apiFetch('/api/runs');

    expect(response.ok).toBe(true);
    // The login used the STORED credentials, not fresh ones.
    expect((authCalls()[0].body as { email: string }).email).toBe('runner-x@device.runlog');
    expect(storedSession()?.token).toBe('renewed');
    const runCalls = calls.filter((call) => call.url === '/api/runs');
    expect(runCalls).toHaveLength(2);
    expect(runCalls[1].headers.Authorization).toBe('Bearer renewed');
  });

  it('throws ApiError with a human message when the server is unreachable', async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError('fetch failed'))) as never;

    await expect(apiFetch('/api/runs')).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch('/api/runs')).rejects.toThrow(/Couldn't reach the server/);
  });

  it('surfaces a failed signup instead of looping', async () => {
    installFetch((call) => {
      if (call.url === '/api/auth/login') return { status: 401 };
      if (call.url === '/api/auth/signup') return { status: 500 };
      return { status: 200, body: [] };
    });

    await expect(apiFetch('/api/runs')).rejects.toThrow(/Creating the device account failed/);
  });

  it('never replaces a stored identity that fails to authenticate (no data loss as recovery)', async () => {
    // The account exists but the stored password no longer matches: login
    // 401s, the same-credentials signup 409s. Minting a fresh identity here
    // would silently abandon every run the stored one owns, so the failure
    // must surface instead.
    window.localStorage.setItem(
      'runlog.session',
      JSON.stringify({ email: 'runner-old@device.runlog', password: 'stale', token: null }),
    );
    installFetch((call) => {
      if (call.url === '/api/auth/login') return { status: 401 };
      if (call.url === '/api/auth/signup') return { status: 409 };
      return { status: 200, body: [] };
    });

    await expect(apiFetch('/api/runs')).rejects.toThrow(
      /saved sign-in no longer matches its account \(409\)/,
    );
    // The stored identity is intact for a later retry, not overwritten.
    expect(storedSession()?.email).toBe('runner-old@device.runlog');
    expect((authCalls()[1].body as { email: string }).email).toBe('runner-old@device.runlog');
  });

  it('adopts a session another tab minted mid-authentication instead of overwriting it', async () => {
    installFetch((call) => {
      if (call.url === '/api/auth/login') {
        // While this tab's login is in flight, another tab finishes its own
        // handshake and writes the key. Last-writer-wins would strand that
        // tab's account (and its runs) forever.
        window.localStorage.setItem(
          'runlog.session',
          JSON.stringify({
            email: 'runner-other-tab@device.runlog',
            password: 'other',
            token: 'other-tab-token',
          }),
        );
        return { status: 401 };
      }
      if (call.url === '/api/auth/signup') return { status: 201, body: { token: 'mine' } };
      return { status: 200, body: [] };
    });

    await apiFetch('/api/runs');

    expect(storedSession()?.email).toBe('runner-other-tab@device.runlog');
    const runsCall = calls.find((call) => call.url === '/api/runs');
    expect(runsCall?.headers.Authorization).toBe('Bearer other-tab-token');
  });

  it('keeps ONE identity for the whole tab when localStorage writes fail', async () => {
    // Safari private mode and third-party embeds throw on setItem. The
    // in-memory session is the source of truth, so blocked storage costs
    // durability (a reload loses the session), never identity: without
    // this, every write would mint a fresh account and the runs would
    // scatter across orphans nobody can reach after reload.
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    installFetch((call) => {
      if (call.url === '/api/auth/login') return { status: 401 };
      if (call.url === '/api/auth/signup') return { status: 201, body: { token: 't' } };
      return { status: 200, body: [] };
    });

    await apiFetch('/api/runs');
    await apiFetch('/api/runs');
    setItem.mockRestore();

    // One signup for two requests, and the degradation is visible to the UI.
    expect(authCalls().filter((call) => call.url.endsWith('signup'))).toHaveLength(1);
    expect(sessionPersistenceDegraded()).toBe(true);
  });

  it('treats an implausible stored session as corruption, not an identity', async () => {
    // Empty credentials can neither log in nor sign up; honoring them as
    // an identity would brick authentication forever. They read as absent
    // and a fresh device account is minted.
    window.localStorage.setItem(
      'runlog.session',
      JSON.stringify({ email: '', password: '', token: null }),
    );
    installFetch((call) => {
      if (call.url === '/api/auth/login') return { status: 401 };
      if (call.url === '/api/auth/signup') return { status: 201, body: { token: 't' } };
      return { status: 200, body: [] };
    });

    const response = await apiFetch('/api/runs');

    expect(response.ok).toBe(true);
    expect((authCalls()[0].body as { email: string }).email).toMatch(/@device\.runlog$/);
  });

  it('marks the signup-409 failure terminal so the UI stops offering retries', async () => {
    window.localStorage.setItem(
      'runlog.session',
      JSON.stringify({ email: 'runner-old@device.runlog', password: 'stale', token: null }),
    );
    installFetch((call) => {
      if (call.url === '/api/auth/login') return { status: 401 };
      if (call.url === '/api/auth/signup') return { status: 409 };
      return { status: 200, body: [] };
    });

    const failure = await apiFetch('/api/runs').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).terminal).toBe(true);
  });

  it('shares one authentication between concurrent first calls', async () => {
    installFetch((call) => {
      if (call.url === '/api/auth/login') return { status: 401 };
      if (call.url === '/api/auth/signup') return { status: 201, body: { token: 't' } };
      return { status: 200, body: [] };
    });

    await Promise.all([apiFetch('/api/runs'), apiFetch('/api/runs')]);

    // One login attempt and one signup, not one per caller: several cards
    // mounting at once must not race signup against itself.
    expect(authCalls()).toHaveLength(2);
  });
});
