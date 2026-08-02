import { render, screen, within } from '@testing-library/react';
import Sidebar from './Sidebar';

// usePathname drives the active state; mock it per test.
const mockUsePathname = jest.fn<string, []>();
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('Sidebar', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/dashboard');
  });

  it('renders the logo and all sections with their items (AC1)', () => {
    render(<Sidebar />);

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
    render(<Sidebar />);

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
    render(<Sidebar />);

    expect(screen.getByRole('link', { name: new RegExp(label, 'i') })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('treats nested routes as part of their section', () => {
    mockUsePathname.mockReturnValue('/runs/42');
    render(<Sidebar />);

    expect(screen.getByRole('link', { name: /runs/i })).toHaveAttribute('aria-current', 'page');
  });
});
