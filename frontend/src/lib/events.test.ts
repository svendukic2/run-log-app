import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  holdEventsLoading,
  installEventsApiMock,
  releaseEventsLoading,
  seedEvents,
} from '@/test/eventsApiMock';
import {
  __resetEventsStoreForTests,
  createEvent,
  ensureEvent,
  getEvents,
  joinEvent,
  leaveEvent,
  useEventsStatus,
} from './events';

// Mounting a store hook is what arms the initial load.
function StatusProbe() {
  return React.createElement('span', { 'data-testid': 'events-status' }, useEventsStatus());
}

const DRAFT = {
  name: 'Summer 100k',
  description: '',
  startDate: '2026-08-10',
  endDate: '2026-08-16',
};

describe('events store (RUN-68)', () => {
  it('loads every page of the paginated list', async () => {
    // More than one server page, so the walk has to continue past page 1.
    seedEvents(
      Array.from({ length: 120 }, (_, index) => ({
        name: `Event ${index + 1}`,
        startDate: '2026-08-10',
        endDate: '2026-08-16',
      })),
    );
    __resetEventsStoreForTests(null); // re-arm the load against the seeded backend

    render(React.createElement(StatusProbe));
    await waitFor(() => expect(screen.getByTestId('events-status')).toHaveTextContent('ready'));

    expect(getEvents()).toHaveLength(120);
  });

  it('re-runs the load when a mutation lands while the walk is in flight (review fix)', async () => {
    // The held response carries the page AS OF the request: the exact
    // staleness a create-during-load races against.
    seedEvents([{ name: 'Existing' }]);
    holdEventsLoading();
    render(React.createElement(StatusProbe));

    await act(async () => {
      await createEvent({ ...DRAFT, name: 'Mid-load' });
      releaseEventsLoading();
    });

    // The settling stale load must not be the last word.
    await waitFor(() => expect(getEvents().map((event) => event.name)).toContain('Mid-load'));
  });

  it('merges a created event into the cache chronologically (AC3)', async () => {
    seedEvents([{ name: 'Later dash', startDate: '2026-09-01', endDate: '2026-09-02' }]);

    await act(async () => {
      await createEvent(DRAFT);
    });

    expect(getEvents().map((event) => event.name)).toEqual(['Summer 100k', 'Later dash']);
    expect(getEvents()[0]).toMatchObject({ joined: true, mine: true });
  });

  it('flips membership and the participant count from the mutation response (AC2)', async () => {
    const [event] = seedEvents([{ name: 'Summer 100k', participantCount: 2 }]);

    await act(async () => {
      await joinEvent(event.id);
    });
    expect(getEvents()[0]).toMatchObject({ joined: true, participantCount: 3 });

    await act(async () => {
      await leaveEvent(event.id);
    });
    expect(getEvents()[0]).toMatchObject({ joined: false, participantCount: 2 });
  });

  it('evicts a row the server no longer has, and fetches one a stale cache lacks', async () => {
    // Cache holds a deleted event: the card vanishing IS the outcome.
    seedEvents([{ id: 'event-ghost', name: 'Deleted elsewhere' }]);
    const cached = getEvents();
    installEventsApiMock();
    __resetEventsStoreForTests(cached);

    await act(async () => {
      await joinEvent('event-ghost');
    });
    expect(getEvents()).toEqual([]);

    // The inverse (review fix): a real event the cache predates.
    const [fresh] = seedEvents([{ name: 'Created elsewhere' }]);
    __resetEventsStoreForTests([]);

    await act(async () => {
      await expect(ensureEvent(fresh.id)).resolves.toBe(true);
      await expect(ensureEvent('event-nope')).resolves.toBe(false);
    });
    expect(getEvents().map((event) => event.name)).toEqual(['Created elsewhere']);
  });
});
