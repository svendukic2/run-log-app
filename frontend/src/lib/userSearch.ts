'use client';

// The People page's search store (RUN-62), reading GET /api/users?search=.
//
// Per-QUERY data, not app-wide data, so this follows eventParticipants.ts
// and publicProfile.ts rather than runs.ts: a SINGLE SLOT holding whichever
// query is on screen instead of a map. A map keyed by query would grow with
// every keystroke pause for the lifetime of the tab, and every entry it
// held would be a search result nobody asked for twice.
//
// The load token matters more here than anywhere else in the app. Typing
// "ana" fires reads for "an" and "ana" whose responses can land in either
// order, and without the token the slower - shorter, wronger - one wins by
// landing last. Every load takes a token and only the newest may publish.
import { useEffect, useSyncExternalStore } from 'react';
import { requestFollow } from './followApi';
import { ApiError, apiFetch } from './session';

const SEARCH_CHANGED_EVENT = 'runlog:user-search-changed';

// One search result row, mirrored from backend/src/users/users.service.ts
// (FoundUser) like every response shape in this app. Name and follow state
// only: a private account appears in search too, so there is deliberately
// nothing here it has not shared.
export interface FoundRunner {
  id: string;
  firstName: string;
  lastName: string;
  following: boolean;
}

// The caller's own follower/following totals.
export interface FollowCounts {
  followers: number;
  following: number;
}

// The envelope (UserSearchResponse). `counts` is the CALLER's own follow
// counts, served with every answer including the empty-query one, which is
// what the page shows before anything is typed.
export interface UserSearchResult {
  items: FoundRunner[];
  total: number;
  page: number;
  pageSize: number;
  counts: FollowCounts;
}

export type UserSearchStatus = 'loading' | 'ready' | 'error';

interface SearchSnapshot {
  // Which query the cache describes; null before the first load. The empty
  // string is a real query (the resting state), so null is the only
  // "nothing loaded" value.
  query: string | null;
  status: UserSearchStatus;
  items: FoundRunner[];
  total: number;
  error: string | null;
  // The caller's OWN follow counts. They ride along on every answer but
  // they belong to the account rather than to the query, so they are held
  // beside the rows and carried across query changes: the line above the
  // results must not blink at every keystroke pause.
  counts: FollowCounts | null;
}

const INITIAL_SNAPSHOT: SearchSnapshot = Object.freeze({
  query: null,
  status: 'loading' as const,
  items: [],
  total: 0,
  error: null,
  counts: null,
});

let snapshot: SearchSnapshot = INITIAL_SNAPSHOT;
// The query a load is currently running for, or null when none is. Read
// only to collapse React's double effect in development.
let inFlightFor: string | null = null;
let loadToken = 0;

function publish(next: SearchSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(SEARCH_CHANGED_EVENT));
}

function isResult(value: unknown): value is UserSearchResult {
  const result = value as UserSearchResult;
  return (
    Array.isArray(result?.items) &&
    result.items.every(
      (item) =>
        typeof item?.id === 'string' &&
        typeof item.firstName === 'string' &&
        typeof item.lastName === 'string' &&
        typeof item.following === 'boolean',
    ) &&
    typeof result.total === 'number' &&
    typeof result.counts?.followers === 'number' &&
    typeof result.counts?.following === 'number'
  );
}

async function fetchResults(query: string): Promise<UserSearchResult> {
  const response = await apiFetch(`/api/users?search=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new ApiError(`The search failed (${response.status}).`, response.status);
  }
  const body: unknown = await response.json();
  // A malformed body is an error, not "nobody matched": an empty list would
  // tell the reader their friend has no account, which is a lie they would
  // believe.
  if (!isResult(body)) {
    throw new ApiError('The server returned search results in an unexpected shape.');
  }
  return body;
}

async function load(query: string): Promise<void> {
  const token = (loadToken += 1);
  inFlightFor = query;
  // Re-running the query already on screen (a retry, a re-visit) keeps its
  // rows visible while the fresh ones arrive. A DIFFERENT query must not:
  // showing the previous query's people under new text is worse than
  // showing nothing for a beat.
  const refreshingInPlace = snapshot.query === query && snapshot.status === 'ready';
  if (!refreshingInPlace) {
    publish({ ...snapshot, query, status: 'loading', items: [], total: 0, error: null });
  }
  try {
    const result = await fetchResults(query);
    if (token !== loadToken) return;
    publish({
      query,
      status: 'ready',
      items: result.items,
      total: result.total,
      error: null,
      counts: result.counts,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Searching runners failed', error);
    }
    if (token !== loadToken || refreshingInPlace) return;
    publish({
      ...snapshot,
      query,
      status: 'error',
      items: [],
      total: 0,
      error: error instanceof ApiError ? error.message : 'Something went wrong with the search.',
    });
  } finally {
    if (token === loadToken) inFlightFor = null;
  }
}

// Reads one query, from an effect and never during render. The guard only
// collapses React's double effect; a re-visit deliberately re-reads,
// because follow state and accounts both change behind our back.
function ensureLoaded(query: string): void {
  if (inFlightFor === query) return;
  void load(query);
}

// The retry handle for the error state.
export function reloadUserSearch(query: string): void {
  void load(query);
}

// Follows or unfollows one row, through the same idempotent API the profile
// header uses. Awaited by the button, which renders any failure inline.
//
// The patch is applied to the CACHED row rather than re-read, exactly like
// the profile store: the endpoint reports the state it guaranteed, so only
// a genuine flip may move a number, and re-running the whole search to move
// one button would blank the list under the reader's cursor.
export async function setFollowingInSearch(userId: string, next: boolean): Promise<void> {
  await requestFollow(userId, next);

  const row = snapshot.items.find((item) => item.id === userId);
  if (!row || row.following === next) return;

  // Retire whatever read is in flight: a search that STARTED before this
  // follow would land after it and replace the whole snapshot, reverting
  // the button. Its own token check cannot catch that - it is still the
  // newest load. inFlightFor is cleared with it, because the load's
  // `finally` only clears it while its token is current and a stale one
  // would wedge ensureLoaded for this query forever.
  loadToken += 1;
  inFlightFor = null;

  publish({
    ...snapshot,
    items: snapshot.items.map((item) => (item.id === userId ? { ...item, following: next } : item)),
    // My own "following" count, the one the page shows above the results.
    counts: snapshot.counts && {
      ...snapshot.counts,
      following: snapshot.counts.following + (next ? 1 : -1),
    },
  });
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(SEARCH_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(SEARCH_CHANGED_EVENT, onStoreChange);
  };
}

// The store for one query. While the cache still describes a different one,
// callers see 'loading' rather than the previous query's people - but they
// keep the counts, which never belonged to the query in the first place.
export function useUserSearch(query: string): {
  status: UserSearchStatus;
  items: FoundRunner[];
  total: number;
  counts: FollowCounts | null;
  error: string | null;
} {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );

  useEffect(() => {
    ensureLoaded(query);
  }, [query]);

  if (current.query !== query) {
    return {
      status: 'loading',
      items: [],
      total: 0,
      counts: current.counts,
      error: null,
    };
  }
  return {
    status: current.status,
    items: current.items,
    total: current.total,
    counts: current.counts,
    error: current.error,
  };
}

// Test-only: puts the cache into a known state without a fetch. Passing
// null re-arms the load (jest.setup.ts wires this up via usersApiMock).
export function __resetUserSearchForTests(
  query: string | null = null,
  result: UserSearchResult | null = null,
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetUserSearchForTests is not available in production');
  }
  inFlightFor = null;
  loadToken += 1;
  snapshot =
    query === null || result === null
      ? INITIAL_SNAPSHOT
      : {
          query,
          status: 'ready',
          items: result.items,
          total: result.total,
          error: null,
          counts: result.counts,
        };
}
