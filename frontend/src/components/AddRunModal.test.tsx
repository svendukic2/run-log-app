import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddRunModal from './AddRunModal';
import { getRuns, todayIso } from '@/lib/runs';

function renderModal() {
  const onClose = jest.fn();
  const user = userEvent.setup();
  render(<AddRunModal onClose={onClose} />);
  return { user, onClose };
}

// A date input rejects partial values as they are typed, so it is set in one go.
function setDate(value: string) {
  fireEvent.change(screen.getByLabelText('Date'), { target: { value } });
}

async function fillValidRun(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { duration?: string; date?: string } = {},
) {
  await user.type(screen.getByLabelText('Route name'), 'Evening tempo');
  await user.type(screen.getByLabelText('Distance (km)'), '8.2');
  await user.type(screen.getByLabelText('Duration'), overrides.duration ?? '42:15');
  if (overrides.date) setDate(overrides.date);
}

const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /save run/i }));

describe('Add run modal (RUN-23)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.style.overflow = '';
  });

  it('opens over the page with all six fields, the placeholders, today and Medium (AC1)', () => {
    renderModal();

    expect(screen.getByRole('dialog', { name: 'Add run' })).toHaveAttribute('aria-modal', 'true');

    expect(screen.getByLabelText('Route name')).toHaveAttribute(
      'placeholder',
      'e.g. Evening tempo',
    );
    expect(screen.getByLabelText('Distance (km)')).toHaveAttribute('placeholder', '0.0');
    expect(screen.getByLabelText('Duration')).toHaveAttribute('placeholder', '00:00');
    expect(screen.getByLabelText('Date')).toHaveValue(todayIso());
    expect(screen.getByRole('radio', { name: 'Medium' })).toBeChecked();
    expect(screen.getByLabelText('Note (optional)')).toHaveAttribute(
      'placeholder',
      'How did it feel? Terrain, weather, splits…',
    );

    // The caret starts in the first field, and the page behind cannot scroll.
    expect(screen.getByLabelText('Route name')).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('creates the run and closes when the form is valid (AC2)', async () => {
    const { user, onClose } = renderModal();

    await fillValidRun(user);
    await user.click(screen.getByRole('radio', { name: 'Hard' }));
    await user.type(screen.getByLabelText('Note (optional)'), 'Windy');
    setDate('2026-07-14');
    await save(user);

    expect(getRuns()).toEqual([
      {
        id: expect.any(String),
        routeName: 'Evening tempo',
        distanceKm: 8.2,
        durationSeconds: 2535,
        date: '2026-07-14',
        effort: 'Hard',
        note: 'Windy',
      },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    ['Cancel', /^cancel$/i],
    ['the close button', /^close$/i],
  ])('closes without saving from %s (AC3)', async (_name, buttonName) => {
    const { user, onClose } = renderModal();
    await fillValidRun(user);

    await user.click(screen.getByRole('button', { name: buttonName }));

    expect(getRuns()).toEqual([]);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without saving on Escape (AC3)', async () => {
    const { user, onClose } = renderModal();
    await fillValidRun(user);

    await user.keyboard('{Escape}');

    expect(getRuns()).toEqual([]);
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    ['an empty route name', 'Route name', ''],
    ['distance 0', 'Distance (km)', '0'],
    ['duration 0', 'Duration', '0:00'],
  ])('refuses to save %s and says so inline (AC4)', async (_name, label, value) => {
    const { user, onClose } = renderModal();
    await fillValidRun(user);
    await user.clear(screen.getByLabelText(label));
    if (value) await user.type(screen.getByLabelText(label), value);

    await save(user);

    const field = screen.getByLabelText(label);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(screen.getByRole('alert').textContent ?? '');
    // The field that failed takes focus, and nothing was written.
    expect(field).toHaveFocus();
    expect(getRuns()).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('rejects a duration that is neither mm:ss nor h:mm:ss (AC4, ADD-6)', async () => {
    const { user } = renderModal();
    await fillValidRun(user, { duration: '42' });

    await save(user);

    expect(screen.getByText('Enter a duration as mm:ss or h:mm:ss')).toBeInTheDocument();
    expect(getRuns()).toEqual([]);
  });

  it.each([
    ['42:15', 2535],
    ['1:18:44', 4724],
  ])('accepts the duration %s and derives pace from it (AC5)', async (duration, seconds) => {
    const { user } = renderModal();

    await fillValidRun(user, { duration });
    await save(user);

    const [run] = getRuns();
    expect(run.durationSeconds).toBe(seconds);
    // Pace is computed from distance and duration, never collected.
    expect(run).not.toHaveProperty('pace');
  });

  it('files a run dated in a past week under that week (AC6)', async () => {
    const { user } = renderModal();

    await fillValidRun(user, { date: '2026-07-02' });
    await save(user);

    expect(getRuns()[0].date).toBe('2026-07-02');
  });

  it('stacks the card, its paired fields and its buttons on a phone (responsive)', () => {
    renderModal();

    // Bottom sheet below `sm`, centred 560px dialog above it.
    const dialog = screen.getByRole('dialog', { name: 'Add run' });
    expect(dialog).toHaveClass('w-full', 'max-w-[560px]', 'max-h-[92dvh]');
    expect(dialog.parentElement).toHaveClass('items-end', 'sm:items-center');

    // Distance and Duration share a row only from `sm` up.
    const pairedRow = screen.getByLabelText('Distance (km)').closest('div')?.parentElement;
    expect(pairedRow).toHaveClass('flex-col', 'sm:flex-row');

    // Both actions span the width of a phone, Save run nearest the thumb.
    for (const name of [/^cancel$/i, /save run/i]) {
      expect(screen.getByRole('button', { name })).toHaveClass('w-full', 'sm:w-auto');
    }

    // A short screen scrolls the fields, never the buttons out of reach.
    expect(screen.getByLabelText('Route name').closest('form')?.firstElementChild).toHaveClass(
      'overflow-y-auto',
    );
  });
});
