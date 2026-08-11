import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppDataBoundary from '@/components/AppDataBoundary';
import { API_TIMEOUT_MS } from '@/lib/session';
import {
  breakRunsAuth,
  expireRunsTokens,
  holdRunsLoading,
  makeGoalLoadFail,
  makeProfileLoadFail,
  makeRunsLoadFail,
  rejectRunsNamed,
  restoreProfileApi,
  restoreRunsApi,
  seedLegacyRuns,
  seedRuns,
} from '@/test/runsApiMock';

function firstRun() {
  return {
    routeName: 'Morning loop',
    distanceKm: 8.2,
    durationSeconds: 2535,
    date: '2026-07-14',
    effort: 'Medium' as const,
    note: '',
  };
}

// The URLs fetched from a given point on, so a test can tell which stores a
// retry actually hit.
function fetchedUrlsSince(callCount: number): string[] {
  return (global.fetch as jest.Mock).mock.calls.slice(callCount).map(([url]) => String(url));
}

describe('AppDataBoundary (RUN-48, widened in RUN-50)', () => {
  it('renders its children once every store is ready', () => {
    seedRuns([firstRun()]);

    render(
      <AppDataBoundary>
        <p>screen content</p>
      </AppDataBoundary>,
    );

    expect(screen.getByText('screen content')).toBeInTheDocument();
  });

  it('stays blank briefly, then admits the load, then times a hang out to the retry card', async () => {
    jest.useFakeTimers();
    try {
      holdRunsLoading();

      render(
        <AppDataBoundary>
          <p>screen content</p>
        </AppDataBoundary>,
      );
      // Let the load chain (session read, then the held GET) reach the
      // network before the clock moves: fake timers freeze time, not
      // microtasks, and the request's own timeout starts when the request
      // does.
      await act(async () => {});

      // First quarter second: nothing, extending the hydration idiom - on
      // the fast local API this is all anyone sees, with no spinner flash.
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByText('screen content')).toBeNull();

      // Past the delay the pending state is admitted instead of an
      // indefinite white screen.
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Loading your data…');

      // A request that hangs is the failure the error state exists for:
      // the app-wide timeout aborts it and the retry card takes over,
      // never an eternal spinner.
      await act(async () => {
        jest.advanceTimersByTime(API_TIMEOUT_MS);
      });
      expect(screen.getByRole('heading', { name: "Your data didn't load" })).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows one retry card on a failed load and recovers through it', async () => {
    const user = userEvent.setup();
    makeRunsLoadFail();

    render(
      <AppDataBoundary>
        <p>screen content</p>
      </AppDataBoundary>,
    );

    // The failure replaces the screen's content with a single honest card.
    expect(
      await screen.findByRole('heading', { name: "Your data didn't load" }),
    ).toBeInTheDocument();
    expect(screen.queryByText('screen content')).toBeNull();

    restoreRunsApi();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('screen content')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "Your data didn't load" })).toBeNull();
  });

  it('renders the specific failure, not one fixed sentence', async () => {
    makeRunsLoadFail(500);

    render(
      <AppDataBoundary>
        <p>screen content</p>
      </AppDataBoundary>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Loading runs failed (500).');
  });

  it('gates the screen when only the profile load fails', async () => {
    // Runs and goal stay healthy: one failed store is enough to hold every
    // derived screen behind the card, because half-loaded data would render
    // half-true numbers.
    makeProfileLoadFail(500);

    render(
      <AppDataBoundary>
        <p>screen content</p>
      </AppDataBoundary>,
    );

    expect(
      await screen.findByRole('heading', { name: "Your data didn't load" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Loading your profile failed (500).');
    expect(screen.queryByText('screen content')).toBeNull();
  });

  it('gates the screen when only the goal load fails', async () => {
    makeGoalLoadFail(500);

    render(
      <AppDataBoundary>
        <p>screen content</p>
      </AppDataBoundary>,
    );

    expect(
      await screen.findByRole('heading', { name: "Your data didn't load" }),
    ).toBeInTheDocument();
    // The goal load is two GETs (goal + current week's target); whichever
    // rejects first names itself, both carry the status.
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Loading (your goal|this week's target) failed \(500\)\./,
    );
    expect(screen.queryByText('screen content')).toBeNull();
  });

  it('Try again after a profile-only failure reloads just the profile store', async () => {
    const user = userEvent.setup();
    makeProfileLoadFail();

    render(
      <AppDataBoundary>
        <p>screen content</p>
      </AppDataBoundary>,
    );
    expect(
      await screen.findByRole('heading', { name: "Your data didn't load" }),
    ).toBeInTheDocument();

    restoreProfileApi();
    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('screen content')).toBeInTheDocument();
    // Only the failed store refetched: the ready runs and goal caches are
    // still good, and re-reading them would be wasted requests.
    const retried = fetchedUrlsSince(callsBefore);
    expect(retried).toContain('/api/profile');
    expect(retried).not.toContain('/api/runs');
    expect(retried).not.toContain('/api/goal');
  });

  it('shows the terminal card with a way out, and no retry, when the identity is dead', async () => {
    // A stored session whose token expired, against an account whose
    // password no longer matches: login 401, signup 409. No retry can fix
    // this, so offering one would be a lie. makeRunsLoadFail plants the
    // session and re-arms the load; the GET failure is then swapped for
    // the auth one.
    makeRunsLoadFail();
    restoreRunsApi();
    expireRunsTokens();
    breakRunsAuth();

    render(
      <AppDataBoundary>
        <p>screen content</p>
      </AppDataBoundary>,
    );

    expect(
      await screen.findByRole('heading', { name: "This device can't sign in to its data" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Clearing this site's data starts a fresh log/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('surfaces the import notice above ready content and dismisses it', async () => {
    const user = userEvent.setup();
    seedLegacyRuns([
      { ...firstRun(), id: 'local-1' },
      { ...firstRun(), routeName: 'Poisoned', date: '2026-07-01', id: 'local-2' },
    ]);
    rejectRunsNamed('Poisoned');

    render(
      <AppDataBoundary>
        <p>screen content</p>
      </AppDataBoundary>,
    );

    expect(await screen.findByText('screen content')).toBeInTheDocument();
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent("1 of your locally saved run couldn't be imported");

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
