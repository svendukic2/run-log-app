'use client';

// The API-backed runs store (RUN-23 semantics, RUN-48 persistence). Data
// lives in PostgreSQL behind /api/runs; this module holds an in-memory
// cache of the caller's runs, loaded once per page load and updated by
// every mutation, so components keep reading synchronously through
// useRuns() exactly as they did when the store was localStorage. All pure
// types, formatters and selectors live in runMath.ts and are re-exported
// here, so existing imports keep working.
//
// Why this module is safe despite module-level mutable state: every write
// path goes through publish(), which touches `window` and would throw on
// the server, and the useSyncExternalStore server snapshot is the frozen
// INITIAL_SNAPSHOT constant, so SSR never reads the mutable value. The
// 'use client' directive documents the intent, but the window-touching
// writes are the actual enforcement - client components still EVALUATE on
// the server during SSR, so the directive alone would not stop a shared
// cache from existing there.
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { ApiError, apiFetch, hasStoredSession } from './session';
import { EFFORT_LEVELS, isRun, type Run, type RunDraft } from './runMath';

export * from './runMath';

// Announces every cache change to this tab's subscribers, so the page behind
// the modal refreshes on save (ADD-3). Cross-tab liveness (the old `storage`
// event) is gone with localStorage: another tab's writes land here on its
// next full load. Accepted for RUN-48; a BroadcastChannel can restore it if
// it ever matters.
const RUNS_CHANGED_EVENT = 'runlog:runs-changed';

/* Store -------------------------------------------------------------------- */

// The cache every read goes through. 'loading' covers "not asked yet" and
// "request in flight" alike: both mean the data is not trustworthy, and the
// distinction matters to nobody downstream. The runs array inside a snapshot
// is immutable; every change swaps the whole snapshot object, which is what
// useSyncExternalStore compares.
export type RunsStatus = 'loading' | 'ready' | 'error';

// What failed and whether retrying can possibly help. `terminal` failures
// (this device's identity cannot authenticate) get different copy and no
// retry button: a "Try again" that fails identically forever is a lie.
export interface RunsError {
  message: string;
  terminal: boolean;
}

interface RunsSnapshot {
  status: RunsStatus;
  runs: Run[];
  error: RunsError | null;
  // A non-blocking message shown above ready content (e.g. "2 runs could
  // not be imported"). Survives mutations, cleared by clearRunsNotice().
  notice: string | null;
}

const INITIAL_SNAPSHOT: RunsSnapshot = Object.freeze({
  status: 'loading' as const,
  runs: [],
  error: null,
  notice: null,
});

let snapshot: RunsSnapshot = INITIAL_SNAPSHOT;
let loadStarted = false;
let loadInFlight = false;

function publish(next: RunsSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
}

// Mirrors the ordering of GET /api/runs (backend runs.service.ts findAll):
// date descending, id descending as the same-day tiebreak. The two MUST
// change together - the client re-sorts its cache with this after every
// mutation, and any divergence makes a freshly added same-day run jump to a
// different position on the next full load.
function compareRunsNewestFirst(a: Run, b: Run): number {
  return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
}

function sortNewestFirst(runs: Run[]): Run[] {
  return [...runs].sort(compareRunsNewestFirst);
}

// Every body the server hands back goes through the same guard; a malformed
// response is an error with a name, never a silently wrong shape in typed
// code.
function parseRunBody(body: unknown): Run {
  if (!isRun(body)) {
    throw new ApiError('The server returned a run in an unexpected shape.');
  }
  return body;
}

async function fetchRuns(): Promise<Run[]> {
  const response = await apiFetch('/api/runs');
  if (!response.ok) {
    throw new ApiError(`Loading runs failed (${response.status}).`, response.status);
  }
  const body: unknown = await response.json();
  // A malformed body is treated as an error, not as an empty log: an empty
  // dashboard lies, a retry card does not.
  if (!Array.isArray(body) || !body.every(isRun)) {
    throw new ApiError('The server returned runs in an unexpected shape.');
  }
  return body;
}

/* One-time import of v1 localStorage data (RUN-48) ------------------------- */

// The pre-RUN-48 store. Data still sitting under this key belongs to a real
// v1 user and must not silently vanish behind an empty API list; it is
// imported into the device account once, then the key is deleted.
const LEGACY_RUNS_KEY = 'runlog.runs';

// v1 entries can predate the note field (isRun rightly rejects that), so
// the legacy reader validates the rest and normalizes note itself.
function readLegacyRuns(): Run[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_RUNS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is Run => {
        const run = value as Run;
        return (
          typeof run?.id === 'string' &&
          typeof run.routeName === 'string' &&
          typeof run.distanceKm === 'number' &&
          typeof run.durationSeconds === 'number' &&
          typeof run.date === 'string' &&
          EFFORT_LEVELS.includes(run.effort)
        );
      })
      .map((run) => ({ ...run, note: typeof run.note === 'string' ? run.note : '' }));
  } catch {
    return [];
  }
}

// POSTs the legacy runs oldest-first (v1 stored newest-first), shrinking the
// key after every processed run, so a failure halfway leaves exactly the
// unprocessed remainder for the retry to resume from. Returns how many runs
// the server REJECTED (4xx): the API is stricter than the v1 forms were
// (length caps, date rules from RUN-47), and one unimportable row must cost
// that row, never the whole app - an aborted import here would put every
// screen behind a retry card that can never succeed. Only transient
// failures (5xx, timeout, network) abort and retry.
async function importLegacyRuns(): Promise<number> {
  let remaining = readLegacyRuns();
  let rejected = 0;
  if (remaining.length === 0) {
    // Junk under the key (never valid runs) was ignored by the old parser
    // too; clearing it keeps it from re-triggering this path forever.
    window.localStorage.removeItem(LEGACY_RUNS_KEY);
    return 0;
  }

  while (remaining.length > 0) {
    const oldest = remaining[remaining.length - 1];
    const { id: _localId, ...draft } = oldest;
    void _localId; // v1 ids were local inventions; the server mints real ones.
    const response = await apiFetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!response.ok) {
      // 401 never reaches here (apiFetch signs out and throws); any other
      // 4xx is this row failing validation the v1 forms never enforced.
      // Terminal for the row, not for the import.
      if (response.status >= 400 && response.status < 500 && response.status !== 401) {
        rejected += 1;
      } else {
        throw new ApiError(
          `Importing your saved runs failed (${response.status}).`,
          response.status,
        );
      }
    }
    remaining = remaining.slice(0, -1);
    window.localStorage.setItem(LEGACY_RUNS_KEY, JSON.stringify(remaining));
  }
  window.localStorage.removeItem(LEGACY_RUNS_KEY);
  return rejected;
}

function toRunsError(error: unknown): RunsError {
  if (error instanceof ApiError) {
    return { message: error.message, terminal: error.terminal };
  }
  return { message: 'Something went wrong loading your runs.', terminal: false };
}

async function loadRuns(): Promise<void> {
  if (loadInFlight) return;
  loadInFlight = true;
  publish({ ...snapshot, status: 'loading', runs: [], error: null });
  try {
    // Signed out means an empty log by definition: answer without the
    // network. Since RUN-58 identity comes from Sign in, so the legacy v1
    // import below can only run FOR a signed-in account - it imports this
    // device's old local runs into whoever signs in here, which is the
    // device's owner in every non-shared-machine case.
    if (!hasStoredSession()) {
      publish({ status: 'ready', runs: [], error: null, notice: snapshot.notice });
      return;
    }
    const rejected = await importLegacyRuns();
    const runs = await fetchRuns();
    publish({
      status: 'ready',
      runs,
      error: null,
      notice:
        rejected > 0
          ? `${rejected} of your locally saved ${rejected === 1 ? 'run' : 'runs'} couldn't be imported (the server applies stricter rules than the old forms did). Everything else is here.`
          : snapshot.notice,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Loading runs failed', error);
    }
    publish({ ...snapshot, status: 'error', runs: [], error: toRunsError(error) });
  } finally {
    loadInFlight = false;
  }
}

// The retry handle for the error state (RunsBoundary's "Try again").
// Repeated clicks while a load is in flight coalesce into that load.
export function reloadRuns(): void {
  void loadRuns();
}

// Kicked from subscribe(), so the first component to mount a runs hook
// triggers exactly one initial load per page load.
function ensureLoaded(): void {
  if (loadStarted) return;
  loadStarted = true;
  void loadRuns();
}

// The cached runs, synchronously. Empty while loading or errored: callers
// that must tell those apart gate on useRunsStatus() (RunsBoundary does this
// once per screen).
export function getRuns(): Run[] {
  return snapshot.runs;
}

export function clearRunsNotice(): void {
  if (snapshot.notice !== null) publish({ ...snapshot, notice: null });
}

// A successful mutation may only merge into a cache that is 'ready'.
// Merging into 'loading' or 'error' would fabricate a "here are all your
// runs" snapshot out of one row (the Add run button lives in the page
// header, OUTSIDE the boundary, so this is reachable); instead the real
// state is (re)loaded.
function mergeAfterMutation(runs: Run[]): void {
  if (snapshot.status === 'ready') {
    publish({ ...snapshot, runs: sortNewestFirst(runs) });
  } else {
    void loadRuns();
  }
}

// Saves through the API and updates the cache, so every screen reading
// through useRuns refreshes at once (ADD-3). Async since RUN-48: callers
// await and surface ApiError.message inline (the modal keeps itself open on
// failure). Nothing is cached on failure.
export async function addRun(draft: RunDraft): Promise<Run> {
  const response = await apiFetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  if (!response.ok) {
    throw new ApiError(`Saving the run failed (${response.status}).`, response.status);
  }
  const run = parseRunBody(await response.json());
  mergeAfterMutation([run, ...snapshot.runs]);
  return run;
}

// Replaces the run through the API and updates the cache, so every screen
// reading through useRuns - list, detail, dashboard, records - refreshes at
// once (RUN-28 AC2). Returns null when the id matches nothing anymore
// (deleted elsewhere); the cache drops the ghost row in that case.
export async function updateRun(id: string, draft: RunDraft): Promise<Run | null> {
  const response = await apiFetch(`/api/runs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  if (response.status === 404) {
    mergeAfterMutation(snapshot.runs.filter((run) => run.id !== id));
    return null;
  }
  if (!response.ok) {
    throw new ApiError(`Saving the changes failed (${response.status}).`, response.status);
  }
  const updated = parseRunBody(await response.json());
  mergeAfterMutation(snapshot.runs.map((run) => (run.id === id ? updated : run)));
  return updated;
}

// Removes the run through the API and updates the cache, so the list, the
// "All runs" count, the dashboard and the records all recompute from the
// remaining runs at once (RUN-30 DEL-2, DEL-3): records and weekly totals
// are derived on render, never stored, so a deleted run cannot leave a
// stale number behind. Returns what the SERVER said: true when it deleted
// the row, false when the row was already gone (404) - the cache's opinion
// does not enter into it.
export async function deleteRun(id: string): Promise<boolean> {
  const response = await apiFetch(`/api/runs/${id}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new ApiError(`Deleting the run failed (${response.status}).`, response.status);
  }
  mergeAfterMutation(snapshot.runs.filter((run) => run.id !== id));
  return response.ok;
}

function subscribeToRuns(onStoreChange: () => void): () => void {
  ensureLoaded();
  window.addEventListener(RUNS_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(RUNS_CHANGED_EVENT, onStoreChange);
  };
}

// True inside a RunsBoundary that has settled. Enforcement of the
// screen-level gate: a component reading runs while the store is still
// loading AND outside any boundary is a screen someone forgot to wrap,
// about to flash its empty state at a user with data - and it throws in
// development so it is caught before it ships. Tests are unaffected: their
// store is primed 'ready' before every test.
export const RunsGateContext = createContext(false);

// Cache-backed hook, safe during SSR/hydration the same way useProfile is:
// the server snapshot is the stable frozen initial object, so SSR never
// reads the mutable module state.
export function useRuns(): Run[] {
  const gated = useContext(RunsGateContext);
  const current = useSyncExternalStore(
    subscribeToRuns,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  );
  const status = current.status;
  // In an effect, not in render: server rendering always sees the initial
  // 'loading' snapshot and legitimately renders the pre-hydration shell, so
  // a render-time throw would kill SSR. Effects run only on a mounted
  // client, which is exactly where the empty-state flash would happen.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && !gated && status === 'loading') {
      throw new Error(
        'useRuns() read while the store is still loading, outside an AppDataBoundary: this screen would flash its empty state. Wrap it in <AppDataBoundary> (see docs/data-model.md, "The frontend API pattern").',
      );
    }
  }, [gated, status]);
  return current.runs;
}

// The load status for screen-level gating (see RunsBoundary): 'loading'
// until the first fetch settles, then 'ready' or 'error'.
export function useRunsStatus(): RunsStatus {
  return useSyncExternalStore(
    subscribeToRuns,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).status;
}

// What failed, for the boundary's error card.
export function useRunsError(): RunsError | null {
  return useSyncExternalStore(
    subscribeToRuns,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).error;
}

// The non-blocking notice (import results, degraded persistence).
export function useRunsNotice(): string | null {
  return useSyncExternalStore(
    subscribeToRuns,
    () => snapshot,
    () => INITIAL_SNAPSHOT,
  ).notice;
}

// Test-only: puts the module-level cache into a known state without a
// fetch, so component tests keep synchronous seeding (jest.setup.ts wires
// this up through src/test/runsApiMock.ts). Passing null re-arms the
// initial load.
export function __resetRunsStoreForTests(runs: Run[] | null = null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetRunsStoreForTests is not available in production');
  }
  loadStarted = runs !== null;
  loadInFlight = false;
  snapshot =
    runs === null
      ? INITIAL_SNAPSHOT
      : { status: 'ready', runs: sortNewestFirst(runs), error: null, notice: null };
}
