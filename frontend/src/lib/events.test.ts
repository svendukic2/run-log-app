import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  failEventsApi,
  installEventsApiMock,
  makeEventsLoadFail,
  restoreEventsApi,
  seedEvents,
} from '@/test/eventsApiMock';
import {
  __resetEventsStoreForTests,
  createEvent,
  getEvents,
  joinEvent,
  leaveEvent,
  useEventsStatus,
  type CommunityEventDraft,
} from './events';

// A minimal component exposing the store status, for the load-path tests
// (mounting it is what arms the initial load).
function StatusProbe() {
  return React.createElement('span', { 'data-testid': 'events-status' }, useEventsStatus());
}

function makeDraft(overrides: Partial<CommunityEventDraft> = {}): CommunityEventDraft {
  return {
    name: 'Summer 100k',
    description: '',
    startDate: '2026-08-10',
    endDate: '2026-08-16',
    ...overrides,
  };
}

describe('events store (RUN-68)', () => {
  describe('initial load', () => {
    it('loads every page of the paginated list', async () => {
      // More than one server page (the mock honors pageSize=100 like the
      // real MAX_PAGE_SIZE), so the walk has to continue past page 1.
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

    it('lands in error when the list request fails, and retries clean', async () => {
      makeEventsLoadFail(500);

      render(React.createElement(StatusProbe));
      await waitFor(() => expect(screen.getByTestId('events-status')).toHaveTextContent('error'));
      expect(getEvents()).toEqual([]);
    });
  });

  describe('createEvent (AC3)', () => {
    it('POSTs and merges the new event into the cache chronologically', async () => {
      seedEvents([{ name: 'Later dash', startDate: '2026-09-01', endDate: '2026-09-02' }]);

      await act(async () => {
        await createEvent(makeDraft({ targetKm: 100 }));
      });

      const names = getEvents().map((event) => event.name);
      expect(names).toEqual(['Summer 100k', 'Later dash']);
      expect(getEvents()[0]).toMatchObject({ joined: true, mine: true, targetKm: 100 });
    });

    it('throws with the status and caches nothing when the API says no', async () => {
      failEventsApi('POST', 500);

      await expect(createEvent(makeDraft())).rejects.toThrow('500');
      expect(getEvents()).toEqual([]);
      restoreEventsApi();
    });
  });

  describe('joinEvent / leaveEvent (AC2)', () => {
    it('flips joined and moves the participant count without a reload', async () => {
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

    it('drops the ghost row and names the reason when joining a deleted event', async () => {
      // The backend row is gone but the cache still shows it: seed both,
      // wipe the backend, put the stale cache back.
      seedEvents([{ id: 'event-ghost', name: 'Deleted elsewhere' }]);
      const cached = getEvents();
      installEventsApiMock();
      __resetEventsStoreForTests(cached);

      await expect(joinEvent('event-ghost')).rejects.toThrow('no longer exists');
      expect(getEvents()).toEqual([]);
    });

    it('surfaces a failed leave without touching the cache', async () => {
      const [event] = seedEvents([{ name: 'Summer 100k', joined: true, participantCount: 3 }]);
      failEventsApi('DELETE', 500);

      await expect(leaveEvent(event.id)).rejects.toThrow('500');
      expect(getEvents()[0]).toMatchObject({ joined: true, participantCount: 3 });
      restoreEventsApi();
    });
  });
});
