import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteRunDialog from './DeleteRunDialog';
import { deleteRun, getRuns, type Run } from '@/lib/runs';
import { failRunsApi, seedRuns } from '@/test/runsApiMock';

const RUN: Run = {
  id: 'run-1',
  routeName: 'Morning loop',
  distanceKm: 8.2,
  durationSeconds: 2535,
  date: '2026-07-07',
  effort: 'Medium',
  note: '',
};

const OTHER: Run = { ...RUN, id: 'run-2', routeName: 'River trail', date: '2026-07-05' };

function renderDialog(onClose = jest.fn(), onDeleted = jest.fn()) {
  render(<DeleteRunDialog run={RUN} onClose={onClose} onDeleted={onDeleted} />);
  return { onClose, onDeleted };
}

describe('Delete run dialog (RUN-30)', () => {
  beforeEach(() => {
    // jest.setup gives every test a fresh, empty mock backend; seed the two
    // runs the assertions below are written against (backend and cache both).
    seedRuns([RUN, OTHER]);
  });

  it('asks "Delete this run?", quotes the run and says it is permanent (AC1, DEL-1)', () => {
    renderDialog();

    const dialog = screen.getByRole('alertdialog', { name: 'Delete this run?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // The body quotes exactly the run under deletion and warns it is final.
    expect(dialog).toHaveTextContent(
      '“Morning loop” will be permanently removed from your log. This action can’t be undone.',
    );
  });

  it('lands focus on Cancel, so Enter out of habit deletes nothing', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('"Delete run" removes the run and hands over to onDeleted (AC2, DEL-2)', async () => {
    const user = userEvent.setup();
    const { onClose, onDeleted } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete run' }));

    // Only the confirmed run is gone; closing is the opener's move via
    // onDeleted, never the plain-dismissal onClose. The delete round-trips to
    // the API since RUN-48, so the handover arrives once the write lands.
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(getRuns()).toEqual([OTHER]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Cancel closes without touching the store (AC3, DEL-2)', async () => {
    const user = userEvent.setup();
    const { onClose, onDeleted } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(getRuns()).toEqual([RUN, OTHER]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('Escape and a scrim click dismiss the same way Cancel does', async () => {
    const user = userEvent.setup();
    const { onClose, onDeleted } = renderDialog();

    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('delete-run-backdrop'));

    expect(getRuns()).toEqual([RUN, OTHER]);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('locks the page scroll while open and restores it on close', () => {
    const { unmount } = render(
      <DeleteRunDialog run={RUN} onClose={jest.fn()} onDeleted={jest.fn()} />,
    );

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('still hands over to onDeleted when the run was already gone', async () => {
    const user = userEvent.setup();
    // Deleted in another tab: neither the backend nor the cache holds the
    // quoted run anymore by the time the dialog confirms.
    await deleteRun(RUN.id);
    const { onDeleted } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete run' }));

    // The outcome the user asked for holds either way.
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(getRuns()).toEqual([OTHER]);
  });

  it('keeps the dialog open with the failure inline and never calls onDeleted (RUN-48)', async () => {
    const user = userEvent.setup();
    failRunsApi('DELETE');
    const { onClose, onDeleted } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete run' }));

    // The run still exists, so pretending it is gone would be worse than
    // admitting the failure: the dialog stays up and announces it.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Deleting the run failed (500).');
    expect(screen.getByRole('alertdialog', { name: 'Delete this run?' })).toBeInTheDocument();
    expect(getRuns()).toEqual([RUN, OTHER]);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
