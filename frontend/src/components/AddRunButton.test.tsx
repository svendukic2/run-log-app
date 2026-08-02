import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddRunButton from './AddRunButton';

function openModal() {
  const user = userEvent.setup();
  return {
    user,
    open: () => user.click(screen.getByRole('button', { name: /add run/i })),
  };
}

describe('Add run button (RUN-15)', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('keeps the modal closed until the button is used (AC2)', () => {
    render(<AddRunButton />);

    expect(screen.getByRole('button', { name: /add run/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the Add run modal over the page (AC2)', async () => {
    const { open } = openModal();
    render(<AddRunButton />);

    await open();

    const dialog = screen.getByRole('dialog', { name: 'Add run' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Focus lands on the first field now that the form is there (RUN-23).
    expect(screen.getByLabelText('Route name')).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it.each([
    [
      'the close button',
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole('button', { name: 'Close' })),
    ],
    [
      'the backdrop',
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByTestId('add-run-backdrop')),
    ],
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
  ])('closes the modal with %s', async (_name, close) => {
    const { user, open } = openModal();
    render(<AddRunButton />);
    await open();

    await close(user);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('returns focus to the button after the modal is dismissed', async () => {
    const { user, open } = openModal();
    render(<AddRunButton />);
    const button = screen.getByRole('button', { name: /add run/i });

    await open();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(button).toHaveFocus();
  });

  it('reopens on a clean form rather than the abandoned one (RUN-23 AC1)', async () => {
    const { user, open } = openModal();
    render(<AddRunButton />);

    await open();
    await user.type(screen.getByLabelText('Route name'), 'Abandoned draft');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await open();

    expect(screen.getByLabelText('Route name')).toHaveValue('');
  });

  it('spans the full width below `sm` and shrinks to its label above it (responsive)', () => {
    render(<AddRunButton />);

    const button = screen.getByRole('button', { name: /add run/i });
    expect(button).toHaveClass('w-full');
    expect(button).toHaveClass('sm:w-auto');
  });

  it('docks the modal to the bottom of small screens (responsive)', async () => {
    const { open } = openModal();
    render(<AddRunButton />);

    await open();

    // The card fills the width as a bottom sheet on a phone and becomes a
    // centered 560px dialog from `sm` up.
    const dialog = screen.getByRole('dialog', { name: 'Add run' });
    expect(dialog).toHaveClass('w-full');
    expect(dialog).toHaveClass('max-w-[560px]');
    expect(dialog.parentElement).toHaveClass('items-end');
    expect(dialog.parentElement).toHaveClass('sm:items-center');
  });
});
