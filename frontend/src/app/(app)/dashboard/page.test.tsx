import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from './page';

describe('Dashboard header (RUN-15)', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('shows the overline greeting, the title and the Add run button (AC1)', () => {
    render(<DashboardPage />);

    const header = screen.getByTestId('page-header');
    expect(within(header).getByText('Good morning, Marko')).toBeInTheDocument();
    expect(within(header).getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /add run/i })).toBeInTheDocument();
  });

  it('opens the Add run modal from the header (AC2)', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await user.click(screen.getByRole('button', { name: /add run/i }));

    expect(screen.getByRole('dialog', { name: 'Add run' })).toBeInTheDocument();
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
