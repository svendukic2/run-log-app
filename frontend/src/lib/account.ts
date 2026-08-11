'use client';

// The account store (RUN-59): the signed-in runner's name and email, cached
// from GET /api/account behind the app-wide store pattern (RUN-48), so the
// sidebar footer, the dashboard greeting and the setup steps read identity
// synchronously through useAccount().
//
// WHY this is a store of its own rather than fields on the profile store:
// identity and setup answers have different lifetimes. The account exists
// from signup; the profile row appears only when setup finishes, and its
// absence is what "onboarding not finished" MEANS (onboarding.ts). Keeping
// them apart is what lets the setup steps greet a runner by name before any
// profile exists - which is the whole of RUN-59 AC3: setup resumes from
// server state on any device, with nothing identity-shaped needed from
// local storage.
//
// Module-level mutable state is safe here for the same reason as in runs.ts:
// every write goes through publish() (touches window) and the
// useSyncExternalStore server snapshot is the frozen initial object.
import { useSyncExternalStore } from 'react';
import { fetchAccount, putAccount, type AccountRecord } from './accountApi';
import { ApiError, hasStoredSession, updateSessionEmail } from './session';

export type { AccountRecord };

const ACCOUNT_CHANGED_EVENT = 'runlog:account-changed';

export type AccountStatus = 'loading' | 'ready' | 'error';

export interface AccountError {
  message: string;
  terminal: boolean;
}

interface AccountSnapshot {
  status: AccountStatus;
  // null + 'ready' = signed out. On 'error' the last good record stays, so
  // the sidebar footer (which reads outside any boundary) does not blank on
  // a transient reload failure.
  account: AccountRecord | null;
  error: AccountError | null;
}

const INITIAL_SNAPSHOT: AccountSnapshot = Object.freeze({
  status: 'loading' as const,
  account: null,
  error: null,
});

let snapshot: AccountSnapshot = INITIAL_SNAPSHOT;
let loadStarted = false;
let loadInFlight = false;

function publish(next: AccountSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
}

function toAccountError(error: unknown): AccountError {
  if (error instanceof ApiError) {
    return { message: error.message, terminal: error.terminal };
  }
  return { message: 'Something went wrong loading your details.', terminal: false };
}

async function loadAccount(): Promise<void> {
  if (loadInFlight) return;
  loadInFlight = true;
  publish({ status: 'loading', account: snapshot.account, error: null });
  try {
    // Signed out means no identity by definition, answered without the
    // network (the same lazy rule the other stores follow).
    if (!hasStoredSession()) {
      publish({ status: 'ready', account: null, error: null });
      return;
    }
    const account = await fetchAccount();
    publish({ status: 'ready', account, error: null });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Loading the account failed', error);
    }
    publish({ status: 'error', account: snapshot.account, error: toAccountError(error) });
  } finally {
    loadInFlight = false;
  }
}

// The retry handle for the boundary's "Try again".
export function reloadAccount(): void {
  void loadAccount();
}

function ensureLoaded(): void {
  if (loadStarted) return;
  loadStarted = true;
  void loadAccount();
}

function subscribeToAccount(onStoreChange: () => void): () => void {
  ensureLoaded();
  window.addEventListener(ACCOUNT_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(ACCOUNT_CHANGED_EVENT, onStoreChange);
  };
}

// Deliberately SOFT (null while loading), like useProfile: the sidebar
// footer reads this outside any boundary and rendering nothing until the
// identity arrives is correct there, not a bug to catch.
export function useAccount(): AccountRecord | null {
  return useSyncExternalStore(
    subscribeToAccount,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).account;
}

export function useAccountStatus(): AccountStatus {
  return useSyncExternalStore(
    subscribeToAccount,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).status;
}

export function useAccountError(): AccountError | null {
  return useSyncExternalStore(
    subscribeToAccount,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).error;
}

// The cached record synchronously, for non-React callers.
export function getAccountRecord(): AccountRecord | null {
  return snapshot.account;
}

// The Settings save for the identity half (RUN-59): a full-replace PUT of
// name and email. Awaited and pessimistic like every write since RUN-48 -
// the form keeps the failure inline and nothing on screen changes until the
// server accepted it. Changing the email changes the SIGN-IN credential; the
// token keeps working (it carries the user id), so no re-authentication is
// needed.
// Returns the STORED record, not the submitted one: the server normalizes the
// email (trim, lowercase, NFC - it is the login credential), so the form must
// adopt what was actually stored or the input and the sidebar footer would
// show two spellings of the same address in one viewport.
export async function saveAccountDetails(update: AccountRecord): Promise<AccountRecord> {
  const account = await putAccount(update);
  publish({ status: 'ready', account, error: null });
  // The session's copy of the email is the credential the user types at Sign
  // in; leaving it stale here would be the same two-truths problem RUN-59
  // exists to remove, one layer down.
  updateSessionEmail(account.email);
  return account;
}

/* Display helpers (RUN-14, moved here with identity in RUN-59) ------------- */

// There is no avatar upload, so the "avatar" is always the derived initials.
// Structurally typed on purpose: any {firstName, lastName} does, so the same
// helpers render an account, an event participant or a followed runner.
interface NamedRunner {
  firstName: string;
  lastName: string;
}

function firstGrapheme(value: string): string {
  // Spread instead of [0] so surrogate pairs ("Đurđa", emoji) stay intact.
  return [...value.trim()][0] ?? '';
}

export function accountInitials(runner: NamedRunner): string {
  return (firstGrapheme(runner.firstName) + firstGrapheme(runner.lastName)).toUpperCase();
}

// "Marko Kovačić" renders as "Marko K." per the Figma footer (node 47:39).
export function accountShortName(runner: NamedRunner): string {
  const lastInitial = firstGrapheme(runner.lastName);
  const firstName = runner.firstName.trim();
  return lastInitial ? `${firstName} ${lastInitial.toUpperCase()}.` : firstName;
}

// Test-only: puts the module-level cache into a known state without a fetch
// (wired up through src/test/runsApiMock.ts). Passing undefined re-arms the
// initial load; a record or null primes 'ready'.
export function __resetAccountStoreForTests(account?: AccountRecord | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetAccountStoreForTests is not available in production');
  }
  loadInFlight = false;
  if (account === undefined) {
    loadStarted = false;
    snapshot = INITIAL_SNAPSHOT;
  } else {
    loadStarted = true;
    snapshot = { status: 'ready', account, error: null };
  }
}
