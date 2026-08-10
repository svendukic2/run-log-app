import { render, screen, within } from '@testing-library/react';
import SettingsPage from './page';

describe('Settings page header and layout (RUN-36)', () => {
  it('shows the overline and the title in the header (AC1)', () => {
    render(<SettingsPage />);

    const header = screen.getByTestId('page-header');
    expect(within(header).getByText('Manage your profile')).toBeInTheDocument();
    expect(within(header).getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('lays out the Profile and Training cards with the Save changes button (AC2)', () => {
    render(<SettingsPage />);

    const body = screen.getByTestId('settings-body');
    const profile = within(body).getByRole('region', { name: 'Profile' });
    const training = within(body).getByRole('region', { name: 'Training' });
    const save = within(body).getByRole('button', { name: /save changes/i });

    // Each card announces itself with its designed heading.
    expect(within(profile).getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(within(training).getByRole('heading', { name: 'Training' })).toBeInTheDocument();

    // The frame's order: Profile, then Training, then the single button.
    expect(
      profile.compareDocumentPosition(training) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(training.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders exactly one Save changes button and no other page action (AC2)', () => {
    render(<SettingsPage />);

    // The stepper pair inside the Training card (RUN-38) adjusts a value; the
    // page-level action - the only submit - is still just Save changes.
    const submits = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('type') === 'submit');
    expect(submits).toHaveLength(1);
    expect(submits[0]).toHaveTextContent('Save changes');
  });

  it('offers no exit control, so navigation happens only via the sidebar (AC3)', () => {
    render(<SettingsPage />);

    // No link anywhere on the page: the sidebar (rendered by the layout, not
    // by this page) is the only way out.
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('keeps the header out of the state-dependent body, matching the other views', () => {
    render(<SettingsPage />);

    const body = screen.getByTestId('settings-body');
    expect(within(body).queryByRole('heading', { name: 'Settings' })).toBeNull();
    expect(body).not.toContainElement(screen.getByTestId('page-header'));
  });
});
