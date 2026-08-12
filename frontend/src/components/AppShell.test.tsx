import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppShell from './AppShell';

const mockUsePathname = jest.fn<string, []>();
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

function renderShell(children: React.ReactNode = <p>Dashboard view</p>) {
  return render(<AppShell>{children}</AppShell>);
}

describe('App shell (RUN-13)', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/dashboard');
    document.body.style.overflow = '';
  });

  it('renders the navigation next to the current view (AC1)', () => {
    renderShell();

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Dashboard view');
  });

  it('keeps the same navigation element when the view changes (AC2)', () => {
    const { rerender } = renderShell();
    const nav = screen.getByRole('navigation', { name: 'Main' });

    mockUsePathname.mockReturnValue('/runs');
    rerender(
      <AppShell>
        <p>Runs view</p>
      </AppShell>,
    );

    // Same DOM node: only the main content was swapped.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBe(nav);
    expect(screen.getByRole('main')).toHaveTextContent('Runs view');
  });

  it('marks the item of the open view as active (AC3)', () => {
    mockUsePathname.mockReturnValue('/coach');
    renderShell();

    expect(screen.getByRole('link', { name: /ai coach/i })).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page'),
    ).toHaveLength(1);
  });
});

describe('App shell on small screens (RUN-13, responsive)', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/dashboard');
    document.body.style.overflow = '';
  });

  it('offers a toggle and keeps the drawer off-canvas until it is used', () => {
    renderShell();

    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'app-navigation');
    // `invisible` also takes the links out of the tab order while off-canvas.
    expect(document.getElementById('app-navigation')).toHaveClass('invisible');
  });

  it('opens the drawer, moves focus into it and locks the page behind it', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(document.getElementById('app-navigation')).not.toHaveClass('invisible');
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it.each([
    [
      'the close button',
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole('button', { name: 'Close navigation' })),
    ],
    [
      'the backdrop',
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByTestId('nav-backdrop')),
    ],
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
  ])('closes the drawer with %s', async (_name, close) => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    await close(user);

    expect(document.getElementById('app-navigation')).toHaveClass('invisible');
    expect(document.body.style.overflow).toBe('');
  });

  // AC5. jsdom has no layout engine, so this asserts the tab ORDER wraps, which
  // is the whole of the behaviour; it says nothing about where anything sits.
  it('traps Tab inside the open drawer instead of leaking onto the page behind it', async () => {
    const user = userEvent.setup();
    renderShell(<button type="button">Behind the drawer</button>);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    const close = screen.getByRole('button', { name: 'Close navigation' });
    // Last stop in the drawer: the profile footer's Sign out, below every link.
    const last = await screen.findByRole('button', { name: 'Sign out' });
    expect(close).toHaveFocus();

    // Backwards off the first item lands on the last one, not on the page.
    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    // ...and forwards off the last item comes back to the first.
    await user.tab();
    expect(close).toHaveFocus();
  });

  it('returns focus to the toggle after the drawer is dismissed', async () => {
    const user = userEvent.setup();
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Open navigation' });

    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));

    expect(toggle).toHaveFocus();
  });

  it('closes the drawer once a navigation happened', async () => {
    const user = userEvent.setup();
    const { rerender } = renderShell();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    mockUsePathname.mockReturnValue('/settings');
    rerender(
      <AppShell>
        <p>Settings view</p>
      </AppShell>,
    );

    expect(document.getElementById('app-navigation')).toHaveClass('invisible');
    expect(document.body.style.overflow).toBe('');
  });
});
