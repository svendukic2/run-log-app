import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    window.localStorage.setItem(
      'runlog.runs',
      JSON.stringify([
        {
          id: 'a',
          routeName: 'Morning loop',
          distanceKm: 8.2,
          durationSeconds: 2535,
          date: '2026-07-14',
          effort: 'Medium',
          note: '',
        },
      ]),
    );
    render(<DashboardPage />);
    expect(
      within(screen.getByRole('region', { name: 'AI Coach' })).getByRole('link', {
        name: /open coach/i,
      }),
    ).toBeInTheDocument();
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
