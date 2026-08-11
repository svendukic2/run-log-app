'use client';

// One runner's public profile (RUN-63), read from GET /api/users/:id.
//
// Per-ENTITY data, not app-wide, so this follows the eventParticipants
// shape rather than the runs/profile/goal one: a SINGLE SLOT holding
// whichever profile is currently open, with its loading and error states
// rendered by the page itself instead of a screen-level AppDataBoundary.
// One profile is open at a time, and a map keyed by user id would only grow
// for the lifetime of the tab.
//
// The privacy gate is NOT here. What the server sends is what exists: a
// private profile arrives with `visible: false` and `runs: null`, and there
// is nothing in this module that could un-hide it, because there is nothing
// to un-hide. This store's whole job is to render the answer, never to
// decide it.
import { useEffect, useSyncExternalStore } from 'react';
import { isRun, type Run } from './runMath';
import { ApiError, apiFetch } from './session';

const PROFILE_CHANGED_EVENT = 'runlog:public-profile-changed';

// The API contract, mirrored from backend/src/users/users.service.ts
// (PublicProfileResponse). Hand-mirrored like every other response shape in
// this app - see CLAUDE.md, "API response contract is hand-mirrored".
export interface PublicProfile {
  id: string;
  firstName: string;
  lastName: string;
  // The viewer is the owner (AC3): the client does not track its own user
  // id, so the API answers this.
  me: boolean;
  following: boolean;
  counts: { followers: number; following: number };
  // Whether the body below the header was served at all. False means gated,
  // never "empty" - an empty public log arrives as `runs: []`.
  visible: boolean;
  // Whether route maps may be drawn for these runs. Nothing renders from it
  // until RUN-72 builds the maps; the run detail already honours it.
  showRoutes: boolean;
  runs: Run[] | null;
}

// 'missing' is its own status, not an error: an unknown id is the designed
// not-found state (AC5), while 'error' is a load that failed and can be
// retried.
export type PublicProfileStatus = 'loading' | 'ready' | 'missing' | 'error';

interface ProfileSnapshot {
  // Which profile the cache currently describes; null before the first load.
  userId: string | null;
  status: PublicProfileStatus;
  profile: PublicProfile | null;
  error: string | null;
}

const INITIAL_SNAPSHOT: ProfileSnapshot = Object.freeze({
  userId: null,
  status: 'loading' as const,
  profile: null,
  error: null,
});

let snapshot: ProfileSnapshot = INITIAL_SNAPSHOT;
// The profile a load is currently running for, or null when none is. Read
// only to collapse React's double effect in development.
let inFlightFor: string | null = null;
// Bumped by every load, so a resolving answer can tell whether it is still
// the newest one. An id alone is not enough: two loads of the SAME profile
// race after a follow, and jumping between two profiles quickly is exactly
// what the participant and leaderboard rows invite.
let loadToken = 0;

function publish(next: ProfileSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
}

function isPublicProfile(value: unknown): value is PublicProfile {
  const profile = value as PublicProfile;
  return (
    typeof profile?.id === 'string' &&
    typeof profile.firstName === 'string' &&
    typeof profile.lastName === 'string' &&
    typeof profile.me === 'boolean' &&
    typeof profile.following === 'boolean' &&
    typeof profile.counts?.followers === 'number' &&
    typeof profile.counts?.following === 'number' &&
    typeof profile.visible === 'boolean' &&
    typeof profile.showRoutes === 'boolean' &&
    // null is the gated case and a real answer; an array must hold runs.
    (profile.runs === null || (Array.isArray(profile.runs) && profile.runs.every(isRun)))
  );
}

// Resolves to null for a 404, which is the not-found state rather than a
// failure. Everything else throws.
async function fetchProfile(userId: string): Promise<PublicProfile | null> {
  const response = await apiFetch(`/api/users/${userId}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new ApiError(`Loading the profile failed (${response.status}).`, response.status);
  }
  const body: unknown = await response.json();
  if (!isPublicProfile(body)) {
    throw new ApiError('The server returned a profile in an unexpected shape.');
  }
  return body;
}

async function load(userId: string): Promise<void> {
  const token = (loadToken += 1);
  inFlightFor = userId;
  // Re-reading the profile already on screen keeps it visible while the
  // fresh copy arrives: the same page, seconds older. Only a first read, a
  // different profile, or a retry after failure blanks to 'loading'.
  const refreshingInPlace = snapshot.userId === userId && snapshot.status === 'ready';
  if (!refreshingInPlace) {
    publish({ userId, status: 'loading', profile: null, error: null });
  }
  try {
    const profile = await fetchProfile(userId);
    if (token !== loadToken) return;
    publish({
      userId,
      status: profile === null ? 'missing' : 'ready',
      profile,
      error: null,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Loading the public profile failed', error);
    }
    // A failed refresh must not throw away a page that was true a moment
    // ago; the next visit corrects it.
    if (token !== loadToken || refreshingInPlace) return;
    publish({
      userId,
      status: 'error',
      profile: null,
      error:
        error instanceof ApiError ? error.message : 'Something went wrong loading this profile.',
    });
  } finally {
    if (token === loadToken) inFlightFor = null;
  }
}

// Reads this profile, from an effect and never during render. One read per
// page visit, deliberately not "unless the cache already holds it": a
// profile changes behind our back (they log runs, they flip a setting), and
// the rows stay on screen while the re-read runs, so it costs no spinner.
// The guard only collapses React's double effect.
function ensureLoaded(userId: string): void {
  if (inFlightFor === userId) return;
  void load(userId);
}

// The retry handle for the error state.
export function reloadPublicProfile(userId: string): void {
  void load(userId);
}

// Follows or unfollows the open profile through the follow API (RUN-61,
// idempotent both ways). Awaited by the button, which renders the failure
// inline - the app-wide mutation pattern.
//
// The counts are patched from the CACHED previous state rather than re-read:
// the endpoint is idempotent, so it reports the state it guaranteed, not
// whether this call changed anything, and only a real flip may move the
// number. A wrong count is cheap and self-corrects on the next visit; a
// spinner over the whole page for one button is not.
export async function setFollowing(userId: string, next: boolean): Promise<void> {
  const response = await apiFetch(`/api/users/${userId}/follow`, {
    method: next ? 'POST' : 'DELETE',
  });
  if (!response.ok) {
    throw new ApiError(
      next
        ? `Following this runner failed (${response.status}).`
        : `Unfollowing this runner failed (${response.status}).`,
      response.status,
    );
  }

  const current = snapshot.profile;
  if (!current || snapshot.userId !== userId || current.following === next) return;

  // Retire whatever read is in flight (review fix). ensureLoaded re-reads on
  // every visit, and that read publishes nothing while it runs, so the page
  // is fully clickable during it: without this, a read that STARTED before
  // the follow lands after it and replaces the whole snapshot, reverting the
  // button and the count to the pre-follow world. Its own token check cannot
  // catch that - it is still the newest load. inFlightFor is cleared with the
  // token because the load's `finally` only clears it while its token is
  // current, and a stale one would wedge ensureLoaded for this id forever.
  loadToken += 1;
  inFlightFor = null;

  publish({
    ...snapshot,
    profile: {
      ...current,
      following: next,
      counts: {
        ...current.counts,
        followers: current.counts.followers + (next ? 1 : -1),
      },
    },
  });
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(PROFILE_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(PROFILE_CHANGED_EVENT, onStoreChange);
  };
}

// The store for one profile. While the cache still describes a DIFFERENT
// profile (the beat between mounting and the effect below), callers see
// 'loading' rather than the previous runner - showing the wrong person's
// records for a frame is worse than showing nothing.
export function usePublicProfile(userId: string): {
  status: PublicProfileStatus;
  profile: PublicProfile | null;
  error: string | null;
} {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );

  useEffect(() => {
    ensureLoaded(userId);
  }, [userId]);

  if (current.userId !== userId) {
    return { status: 'loading', profile: null, error: null };
  }
  return { status: current.status, profile: current.profile, error: current.error };
}

// Test-only: puts the cache into a known state without a fetch. Passing
// null re-arms the load (jest.setup.ts wires this up via usersApiMock).
export function __resetPublicProfileForTests(profile: PublicProfile | null = null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetPublicProfileForTests is not available in production');
  }
  inFlightFor = null;
  loadToken += 1;
  snapshot =
    profile === null
      ? INITIAL_SNAPSHOT
      : { userId: profile.id, status: 'ready', profile, error: null };
}
