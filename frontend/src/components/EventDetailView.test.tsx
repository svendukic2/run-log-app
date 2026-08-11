import { render, screen } from '@testing-library/react';
import { seedEvents } from '@/test/eventsApiMock';
import { __resetEventsStoreForTests } from '@/lib/events';
import EventDetailView from './EventDetailView';

describe('EventDetailView (RUN-68 AC5, thin cut until RUN-69)', () => {
  it('renders the header facts and description for a known event', () => {
    const [event] = seedEvents([
      {
        name: 'Summer 100k',
        description: 'Run 100 km together',
        startDate: '2026-08-10',
        endDate: '2026-08-16',
        targetKm: 100,
        participantCount: 3,
        mine: true,
      },
    ]);

    render(<EventDetailView eventId={event.id} />);

    expect(screen.getByRole('heading', { name: 'Summer 100k' })).toBeInTheDocument();
    expect(screen.getByText('Your event')).toBeInTheDocument();
    expect(screen.getByText(/3 runners/)).toBeInTheDocument();
    expect(screen.getByText('Run 100 km together')).toBeInTheDocument();
  });

  it('fetches an event the cache predates before declaring anything missing (review fix)', async () => {
    const [event] = seedEvents([{ name: 'Created elsewhere' }]);
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
