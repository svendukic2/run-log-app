import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seedProfile } from '@/test/runsApiMock';
import Sidebar from './Sidebar';

// usePathname drives the active state; mock it per test.
const mockUsePathname = jest.fn<string, []>();
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

const onClose = jest.fn();

// The drawer state only matters below `lg`; these tests render the open
// sidebar, which is what the desktop column renders too.
function renderSidebar() {
  return render(<Sidebar isOpen onClose={onClose} />);
}

describe('Sidebar', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/dashboard');
    onClose.mockClear();
  });

  it('renders the logo and all sections with their items (AC1)', () => {
    renderSidebar();

    expect(screen.getByText('Run Log')).toBeInTheDocument();
    expect(screen.getByText('TRAINING TRACKER')).toBeInTheDocument();

    expect(screen.getByText('MENU')).toBeInTheDocument();
    expect(screen.getByText('ASSISTANT')).toBeInTheDocument();
    expect(screen.getByText('ACCOUNT')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /runs/i })).toHaveAttribute('href', '/runs');
    expect(screen.getByRole('link', { name: /ai coach/i })).toHaveAttribute('href', '/coach');
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
  });

  it('highlights exactly the current view and gives it the dot (AC2)', () => {
    mockUsePathname.mockReturnValue('/runs');
    renderSidebar();

    const active = screen.getByRole('link', { name: /runs/i });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(within(active).getByTestId('active-dot')).toBeInTheDocument();

    // Exactly one item is active and exactly one dot exists.
    const links = screen.getAllByRole('link');
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(1);
    expect(screen.getAllByTestId('active-dot')).toHaveLength(1);
  });

  it.each([
    ['/dashboard', 'Dashboard'],
    ['/runs', 'Runs'],
    ['/coach', 'AI Coach'],
    ['/settings', 'Settings'],
  ])('marks %s as active for the %s item (AC4)', (pathname, label) => {
    mockUsePathname.mockReturnValue(pathname);
    renderSidebar();

    expect(screen.getByRole('link', { name: new RegExp(label, 'i') })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('treats nested routes as part of their section', () => {
    mockUsePathname.mockReturnValue('/runs/42');
    renderSidebar();

    expect(screen.getByRole('link', { name: /runs/i })).toHaveAttribute('aria-current', 'page');
  });

  describe('profile footer (RUN-14)', () => {
    it('shows initials, "{First name} {L}." and the email from the stored profile (AC1)', () => {
      seedProfile({ firstName: 'Marko', lastName: 'Kovačić', email: 'marko@email.com' });
      renderSidebar();

      const footer = screen.getByTestId('profile-footer');
      expect(within(footer).getByText('MK')).toBeInTheDocument();
      expect(within(footer).getByText('Marko K.')).toBeInTheDocument();
      expect(within(footer).getByText('marko@email.com')).toBeInTheDocument();
    });

    it('derives the initials from first and last name, not a hardcoded pair (AC2)', () => {
      seedProfile({ firstName: 'ana', lastName: 'barić', email: 'ana@email.com' });
      renderSidebar();

      const footer = screen.getByTestId('profile-footer');
      expect(within(footer).getByText('AB')).toBeInTheDocument();
      expect(within(footer).getByText('ana B.')).toBeInTheDocument();
    });

    it.each(['/dashboard', '/runs', '/coach', '/settings'])(
      'renders the same footer on %s (AC3)',
      (pathname) => {
        mockUsePathname.mockReturnValue(pathname);
        seedProfile({ firstName: 'Marko', lastName: 'Kovačić', email: 'marko@email.com' });
        renderSidebar();

        const footer = screen.getByTestId('profile-footer');
        expect(within(footer).getByText('MK')).toBeInTheDocument();
        expect(within(footer).getByText('Marko K.')).toBeInTheDocument();
        expect(within(footer).getByText('marko@email.com')).toBeInTheDocument();
      },
    );

    it('renders no footer while the account has no profile yet', () => {
      renderSidebar();

      expect(screen.queryByTestId('profile-footer')).not.toBeInTheDocument();
    });
  });

  it('dismisses the mobile drawer from its close button (RUN-13, responsive)', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Close navigation' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
