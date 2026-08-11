import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  makeParticipantsLoadFail,
  restoreParticipantsApi,
  seedEvents,
  seedParticipants,
} from '@/test/eventsApiMock';
import { __resetEventsStoreForTests } from '@/lib/events';
import EventDetailView from './EventDetailView';

function seedEvent(overrides: Parameters<typeof seedEvents>[0][number]) {
  const [event] = seedEvents([overrides]);
  return event;
}

describe('EventDetailView (RUN-69)', () => {
  it('renders the header facts, the ranked leaderboard and every participant (AC1, AC2, AC3)', () => {
    const event = seedEvent({
      name: 'Summer 100k',
      description: 'Run 100 km together',
      startDate: '2026-08-10',
      endDate: '2026-08-16',
      targetKm: 100,
      participantCount: 3,
      state: 'active',
      mine: true,
    });
    seedParticipants(event.id, [
      { firstName: 'Bruno', rank: 2, totalKm: 8, runCount: 2 },
      // Off leaderboards: in the list, but the server sent none of the
      // numbers a rank would need.
      { firstName: 'Carla', rank: null },
      { firstName: 'Ana', rank: 1, totalKm: 12.5, runCount: 3, me: true },
    ]);

    render(<EventDetailView eventId={event.id} />);

    expect(screen.getByRole('heading', { name: 'Summer 100k' })).toBeInTheDocument();
    expect(screen.getByText('Your event')).toBeInTheDocument();
    expect(screen.getByText(/3 runners/)).toBeInTheDocument();
    expect(screen.getByText('Run 100 km together')).toBeInTheDocument();

    // Ranked order, not join order, and my row is marked.
    const board = within(screen.getByRole('region', { name: 'Leaderboard' }));
    expect(board.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Ana Tester'),
      expect.stringContaining('Bruno Tester'),
    ]);
    expect(board.getByText('You')).toBeInTheDocument();
    expect(board.getByText('12.5 km')).toBeInTheDocument();
    expect(board.getByText('3 runs')).toBeInTheDocument();
    expect(board.queryByText(/Carla/)).not.toBeInTheDocument();

    // Every participant, opted out or not, with a link to their profile.
    const roster = within(screen.getByRole('region', { name: /Participants/ }));
    expect(roster.getAllByRole('listitem')).toHaveLength(3);
    expect(roster.getByRole('link', { name: /Carla Tester/ })).toHaveAttribute(
      'href',
      '/people/user-carla',
    );
  });

  it('replaces the board with the start date on an upcoming event (AC4)', () => {
    const event = seedEvent({
      name: 'Next month dash',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      state: 'upcoming',
    });
    seedParticipants(event.id, [{ firstName: 'Ana', rank: 1 }]);

    render(<EventDetailView eventId={event.id} />);

    const board = within(screen.getByRole('region', { name: 'Leaderboard' }));
    expect(board.getByText(/starts on Sep 1, 2026/)).toBeInTheDocument();
    expect(board.queryByRole('listitem')).not.toBeInTheDocument();
    // The participant list is unaffected: joining happens before the start.
    expect(screen.getByRole('link', { name: /Ana Tester/ })).toBeInTheDocument();
  });

  it('offers a retry when the participants read fails, leaving the header readable', async () => {
    const user = userEvent.setup();
    const event = seedEvent({ name: 'Summer 100k' });
    seedParticipants(event.id, [{ firstName: 'Ana', rank: 1 }]);
    makeParticipantsLoadFail(500);

    render(<EventDetailView eventId={event.id} />);

    expect(await screen.findByRole('alert')).toHaveTextContent("Participants didn't load");
    expect(screen.getByRole('heading', { name: 'Summer 100k' })).toBeInTheDocument();

    restoreParticipantsApi();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    const roster = await screen.findByRole('region', { name: /Participants/ });
    expect(within(roster).getByRole('link', { name: /Ana Tester/ })).toBeInTheDocument();
  });

  it('never shows the previously opened event’s runners', async () => {
    const first = seedEvent({ name: 'First' });
    const second = seedEvent({ name: 'Second' });
    seedParticipants(first.id, [{ firstName: 'Ana', rank: 1 }]);
    // The per-event cache now describes `second`; opening `first` must
    // reload rather than render Bruno under First's name.
    seedParticipants(second.id, [{ firstName: 'Bruno', rank: 1 }]);

    render(<EventDetailView eventId={first.id} />);

    expect(screen.queryByText(/Bruno/)).not.toBeInTheDocument();
    const roster = await screen.findByRole('region', { name: /Participants/ });
    expect(within(roster).getByRole('link', { name: /Ana Tester/ })).toBeInTheDocument();
  });

  it('fetches an event the cache predates before declaring anything missing', async () => {
    const event = seedEvent({ name: 'Created elsewhere' });
    seedParticipants(event.id, [{ firstName: 'Ana', rank: 1 }]);
    __resetEventsStoreForTests([]); // stale cache, populated backend

    render(<EventDetailView eventId={event.id} />);

    expect(await screen.findByRole('heading', { name: 'Created elsewhere' })).toBeInTheDocument();
  });

  it('renders the not-found state once the by-id read comes back empty', async () => {
    render(<EventDetailView eventId="nope" />);

    expect(await screen.findByText(/doesn't exist/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to events/i })).toHaveAttribute(
      'href',
      '/events',
    );
  });
});
