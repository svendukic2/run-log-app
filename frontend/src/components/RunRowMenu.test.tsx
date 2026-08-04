import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RunRowMenu from './RunRowMenu';
import { getRuns, type Run } from '@/lib/runs';

const RUN: Run = {
  id: 'run-1',
  routeName: 'Morning loop',
  distanceKm: 8.2,
  durationSeconds: 2535, // 42:15
  date: '2026-07-07',
  effort: 'Medium',
  note: 'Felt easy',
};

function storeRun(run: Run) {
  window.localStorage.setItem('runlog.runs', JSON.stringify([run]));
}

const kebab = () => screen.getByRole('button', { name: 'Open menu for Morning loop' });

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(kebab());
  return screen.getByRole('menu', { name: 'Actions for Morning loop' });
}

describe('Run row menu (RUN-29)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    storeRun(RUN);
    // jsdom has no layout, so the viewport the placement maths reads is
    // pinned to a sane size; the kebab's rect stays at zeros, which lands in
    // the plenty-of-room-below branch.
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 1024,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: 768,
      configurable: true,
    });
  });

  it('opens a menu with Edit and a danger Delete from the kebab (AC1)', async () => {
    const user = userEvent.setup();
    render(<RunRowMenu run={RUN} />);

    expect(kebab()).toHaveAttribute('aria-haspopup', 'menu');
    expect(kebab()).toHaveAttribute('aria-expanded', 'false');

    const menu = await openMenu(user);

    expect(kebab()).toHaveAttribute('aria-expanded', 'true');
    const edit = screen.getByRole('menuitem', { name: 'Edit' });
    const del = screen.getByRole('menuitem', { name: 'Delete' });
    expect(menu).toContainElement(edit);
    expect(menu).toContainElement(del);
    // Delete carries the coral danger color from the design (MNU-1).
    expect(del).toHaveClass('text-accent');
    // The first item takes focus, so the menu is immediately keyboardable.
    expect(edit).toHaveFocus();
  });

  it('opens the Edit run modal prefilled for that exact run (AC2)', async () => {
    const user = userEvent.setup();
    render(<RunRowMenu run={RUN} />);

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    // The menu gives way to the modal (EDT-1 via RUN-28).
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit run' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Route name')).toHaveValue('Morning loop');
    expect(screen.getByLabelText('Distance (km)')).toHaveValue('8.2');
    expect(screen.getByLabelText('Duration')).toHaveValue('42:15');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-07-07');
    expect(screen.getByRole('radio', { name: 'Medium' })).toBeChecked();
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('Felt easy');
  });

  it('hands focus back to the kebab when the Edit modal closes', async () => {
    const user = userEvent.setup();
    render(<RunRowMenu run={RUN} />);

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(kebab()).toHaveFocus();
  });

  it('keeps Delete visible but inert until RUN-30 (AC3 seam)', async () => {
    const user = userEvent.setup();
    render(<RunRowMenu run={RUN} />);

    const menu = await openMenu(user);
    const del = screen.getByRole('menuitem', { name: 'Delete' });
    expect(del).toHaveAttribute('aria-disabled', 'true');

    await user.click(del);

    // A click visibly does nothing: the menu stays open - closing is the
    // signature of an action that succeeded - and nothing else happens.
    expect(menu).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getRuns()).toEqual([RUN]);
  });

  it('closes without any action on Escape and returns focus to the kebab (AC4)', async () => {
    const user = userEvent.setup();
    render(<RunRowMenu run={RUN} />);

    await openMenu(user);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(kebab()).toHaveFocus();
    expect(getRuns()).toEqual([RUN]);
  });

  it('closes without any action on a click elsewhere (AC4)', async () => {
    const user = userEvent.setup();
    render(<RunRowMenu run={RUN} />);

    await openMenu(user);
    // The transparent backdrop is "elsewhere": it swallows the click so the
    // dismissal cannot fall through to whatever sits underneath.
    await user.click(screen.getByTestId('run-row-menu-backdrop'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getRuns()).toEqual([RUN]);
  });

  it('moves between the items with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<RunRowMenu run={RUN} />);

    await openMenu(user);
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();

    // With two items either arrow wraps to the other one.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
  });

  it('flips above the kebab when the viewport below cannot fit it', async () => {
    const user = userEvent.setup();
    render(<RunRowMenu run={RUN} />);

    // A kebab 36px off the bottom of the 768px viewport: no room below.
    kebab().getBoundingClientRect = () =>
      ({
        top: 700,
        bottom: 732,
        left: 868,
        right: 900,
        width: 32,
        height: 32,
        x: 868,
        y: 700,
        toJSON: () => ({}),
      }) as DOMRect;

    const menu = await openMenu(user);

    expect(menu.style.bottom).toBe(`${768 - 700 + 4}px`);
    expect(menu.style.top).toBe('');
    expect(menu.style.right).toBe(`${1024 - 900}px`);
  });

  it('closes when anything scrolls, since its anchor is gone', async () => {
    const user = userEvent.setup();
    render(<RunRowMenu run={RUN} />);

    await openMenu(user);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
