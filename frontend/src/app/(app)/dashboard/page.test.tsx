import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { holdRunsLoading, makeRunsLoadFail, restoreRunsApi, seedRuns } from '@/test/runsApiMock';
import DashboardPage from './page';

describe('Dashboard header (RUN-15)', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
    window.localStorage.clear();
  });

  it('shows the overline greeting, the title and the Add run button (AC1)', () => {
    render(<DashboardPage />);

    // The greeting's exact copy (name, time-of-day variants) is pinned in
    // DashboardGreeting.test.tsx (RUN-16); here only the composition matters.
    const header = screen.getByTestId('page-header');
    expect(within(header).getByText(/^Good (morning|afternoon|evening)/)).toBeInTheDocument();
    expect(within(header).getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /add run/i })).toBeInTheDocument();
  });

  it('opens the Add run modal from the header (AC2)', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await user.click(screen.getByRole('button', { name: /add run/i }));

    expect(screen.getByRole('dialog', { name: 'Add run' })).toBeInTheDocument();
  });

  it('renders the AI Coach card in the right column in both dashboard states (RUN-21)', () => {
    // Empty state (04): the coach card invites the first run.
    const { unmount } = render(<DashboardPage />);
    const body = screen.getByTestId('dashboard-body');
    expect(within(body).getByRole('region', { name: 'AI Coach' })).toBeInTheDocument();
    unmount();

    // Filled state (05): still there, now pointing at the coach page.
    seedRuns([
      {
        id: 'a',
        routeName: 'Morning loop',
        distanceKm: 8.2,
        durationSeconds: 2535,
        date: '2026-07-14',
        effort: 'Medium',
        note: '',
      },
    ]);
    render(<DashboardPage />);
    expect(
      within(screen.getByRole('region', { name: 'AI Coach' })).getByRole('link', {
        name: /open coach/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the personal records card in the right column in both states (RUN-22)', () => {
    // Empty state (04): the card explains itself.
    const { unmount } = render(<DashboardPage />);
    const body = screen.getByTestId('dashboard-body');
    const emptyCard = within(body).getByRole('region', { name: 'Personal records' });
    expect(within(emptyCard).getByText('No records yet')).toBeInTheDocument();
    // The card sits below the coach card, per 04/05's right column.
    const coach = within(body).getByRole('region', { name: 'AI Coach' });
    expect(
      coach.compareDocumentPosition(emptyCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    unmount();

    // Filled state (05): rows derived from the stored runs.
    seedRuns([
      {
        id: 'a',
        routeName: 'Morning loop',
        distanceKm: 8.2,
        durationSeconds: 2535,
        date: '2026-07-14',
        effort: 'Medium',
        note: '',
      },
    ]);
    render(<DashboardPage />);
    const card = screen.getByRole('region', { name: 'Personal records' });
    expect(within(card).getByText('Longest run')).toBeInTheDocument();
    expect(within(card).getByText('8.2 km')).toBeInTheDocument();
  });

  it('keeps the header out of the state-dependent body, so both states share it (AC3)', () => {
    render(<DashboardPage />);

    // The empty (04) and filled (05) states render inside the body, which holds
    // no part of the header, so neither state can change or drop it.
    const body = screen.getByTestId('dashboard-body');
    expect(within(body).queryByRole('heading', { name: 'Dashboard' })).toBeNull();
    expect(within(body).queryByRole('button', { name: /add run/i })).toBeNull();
    expect(body).not.toContainElement(screen.getByTestId('page-header'));
  });
});

describe('runs loading (RUN-48)', () => {
  it('renders the header but no body while the runs load is in flight', () => {
    holdRunsLoading();
    render(<DashboardPage />);

    // The whole state-dependent body sits behind AppDataBoundary, so neither
    // the empty-state prompt nor the filled cards can flash while loading.
    expect(screen.queryByTestId('dashboard-body')).not.toBeInTheDocument();
    expect(screen.queryByText('Log your first run')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows the error card when the load fails, and Try again recovers', async () => {
    const user = userEvent.setup();
    makeRunsLoadFail();
    render(<DashboardPage />);

    expect(await screen.findByText("Your data didn't load")).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-body')).not.toBeInTheDocument();

    restoreRunsApi();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('dashboard-body')).toBeInTheDocument();
  });
});
