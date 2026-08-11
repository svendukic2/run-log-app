import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RunsBoundary from '@/components/RunsBoundary';
import { API_TIMEOUT_MS } from '@/lib/session';
import {
  breakRunsAuth,
  expireRunsTokens,
  holdRunsLoading,
  makeRunsLoadFail,
  rejectRunsNamed,
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

describe('RunsBoundary (RUN-48)', () => {
  it('renders its children once the store is ready', () => {
    seedRuns([firstRun()]);

    render(
      <RunsBoundary>
        <p>screen content</p>
      </RunsBoundary>,
    );

    expect(screen.getByText('screen content')).toBeInTheDocument();
  });

  it('stays blank briefly, then admits the load, then times a hang out to the retry card', async () => {
    jest.useFakeTimers();
    try {
      holdRunsLoading();

      render(
        <RunsBoundary>
          <p>screen content</p>
        </RunsBoundary>,
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
      expect(screen.getByRole('status')).toHaveTextContent('Loading your runs…');

      // A request that hangs is the failure the error state exists for:
      // the app-wide timeout aborts it and the retry card takes over,
      // never an eternal spinner.
      await act(async () => {
        jest.advanceTimersByTime(API_TIMEOUT_MS);
      });
      expect(
        screen.getByRole('heading', { name: "Your runs didn't load" }),
      ).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows one retry card on a failed load and recovers through it', async () => {
    const user = userEvent.setup();
    makeRunsLoadFail();

    render(
      <RunsBoundary>
        <p>screen content</p>
      </RunsBoundary>,
    );

    // The failure replaces the screen's content with a single honest card.
    expect(
      await screen.findByRole('heading', { name: "Your runs didn't load" }),
    ).toBeInTheDocument();
    expect(screen.queryByText('screen content')).toBeNull();

    restoreRunsApi();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('screen content')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "Your runs didn't load" })).toBeNull();
  });

  it('renders the specific failure, not one fixed sentence', async () => {
    makeRunsLoadFail(500);

    render(
      <RunsBoundary>
        <p>screen content</p>
      </RunsBoundary>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Loading runs failed (500).');
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
      <RunsBoundary>
        <p>screen content</p>
      </RunsBoundary>,
    );

    expect(
      await screen.findByRole('heading', { name: "This device can't sign in to its runs" }),
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
      <RunsBoundary>
        <p>screen content</p>
      </RunsBoundary>,
    );

    expect(await screen.findByText('screen content')).toBeInTheDocument();
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent("1 of your locally saved run couldn't be imported");

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
