import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { failEventsApi, holdEventsCreate, releaseEventsCreate } from '@/test/eventsApiMock';
import { getEvents, todayIso } from '@/lib/events';
import EventModal from './EventModal';

const onClose = jest.fn();

describe('EventModal (RUN-68 AC3)', () => {
  beforeEach(() => {
    onClose.mockClear();
  });

  it('blocks an invalid form inline, saving nothing', async () => {
    const user = userEvent.setup();
    render(<EventModal onClose={onClose} />);

    // Opens as a one-day event today, so only the name is missing.
    expect(screen.getByLabelText('Start date')).toHaveValue(todayIso());
    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(screen.getByText('Event name is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(getEvents()).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('saves a valid event and closes', async () => {
    const user = userEvent.setup();
    render(<EventModal onClose={onClose} />);

    await user.type(screen.getByLabelText('Name'), 'Summer 100k');
    await user.type(screen.getByLabelText('Target km (optional)'), '100');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getEvents()[0]).toMatchObject({ name: 'Summer 100k', targetKm: 100, mine: true });
  });

  it('stays open with an inline alert and the typed values when the API says no', async () => {
    const user = userEvent.setup();
    failEventsApi('POST', 500);
    render(<EventModal onClose={onClose} />);

    await user.type(screen.getByLabelText('Name'), 'Summer 100k');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/500/);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveValue('Summer 100k');
  });

  it('refuses to dismiss mid-save, then dismisses normally (review fix)', async () => {
    const user = userEvent.setup();
    holdEventsCreate();
    render(<EventModal onClose={onClose} />);

    await user.type(screen.getByLabelText('Name'), 'Summer 100k');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    // The save is in flight: closing now would swallow a late failure.
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('event-modal-backdrop'));
    expect(onClose).not.toHaveBeenCalled();

    // Once the save lands, the modal closes on its own.
    releaseEventsCreate();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('dismisses on Escape and on the scrim when idle, saving nothing', async () => {
    const user = userEvent.setup();
    render(<EventModal onClose={onClose} />);

    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('event-modal-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(getEvents()).toEqual([]);
  });
});
