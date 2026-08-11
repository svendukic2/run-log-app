import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { failEventsApi } from '@/test/eventsApiMock';
import { getEvents, todayIso } from '@/lib/events';
import EventModal from './EventModal';

const onClose = jest.fn();

function renderModal() {
  return render(<EventModal onClose={onClose} />);
}

describe('EventModal (RUN-68 AC3)', () => {
  beforeEach(() => {
    onClose.mockClear();
  });

  it('opens with both dates prefilled to today and focus on the name', () => {
    renderModal();

    expect(screen.getByLabelText('Start date')).toHaveValue(todayIso());
    expect(screen.getByLabelText('End date')).toHaveValue(todayIso());
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('rejects a blank name inline and saves nothing', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(screen.getByText('Event name is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(getEvents()).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('enforces the date pair rule on the end date (AC3)', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText('Name'), 'Summer 100k');
    // Native date inputs: clear then type the new day.
    const endDate = screen.getByLabelText('End date');
    await user.clear(endDate);
    await user.type(endDate, '2020-01-01');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(screen.getByText("End date can't be before the start date")).toBeInTheDocument();
    expect(getEvents()).toEqual([]);
  });

  it('rejects a non-positive target inline', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText('Name'), 'Summer 100k');
    await user.type(screen.getByLabelText('Target km (optional)'), '0');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(screen.getByText('Enter a target greater than 0')).toBeInTheDocument();
    expect(getEvents()).toEqual([]);
  });

  it('saves a valid event and closes (AC3)', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText('Name'), 'Summer 100k');
    await user.type(screen.getByLabelText('Description (optional)'), 'Run together');
    await user.type(screen.getByLabelText('Target km (optional)'), '100');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getEvents()).toHaveLength(1);
    expect(getEvents()[0]).toMatchObject({
      name: 'Summer 100k',
      description: 'Run together',
      targetKm: 100,
      joined: true,
      mine: true,
    });
  });

  it('keeps itself open with an inline alert when the API says no', async () => {
    const user = userEvent.setup();
    failEventsApi('POST', 500);
    renderModal();

    await user.type(screen.getByLabelText('Name'), 'Summer 100k');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/500/);
    expect(onClose).not.toHaveBeenCalled();
    // Everything typed stays intact for the retry.
    expect(screen.getByLabelText('Name')).toHaveValue('Summer 100k');
  });

  it('dismisses on Escape and on the scrim, saving nothing', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('event-modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(getEvents()).toEqual([]);
  });
});
