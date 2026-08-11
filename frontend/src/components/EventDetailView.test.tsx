import { render, screen } from '@testing-library/react';
import { seedEvents } from '@/test/eventsApiMock';
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
        joined: true,
      },
    ]);

    render(<EventDetailView eventId={event.id} />);

    expect(screen.getByRole('heading', { name: 'Summer 100k' })).toBeInTheDocument();
    expect(screen.getByText('Your event')).toBeInTheDocument();
    expect(screen.getByText(/3 runners/)).toBeInTheDocument();
    expect(screen.getByText(/Target 100 km/)).toBeInTheDocument();
    expect(screen.getByText('Run 100 km together')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /events/i })).toHaveAttribute('href', '/events');
  });

  it('renders the not-found state for an unknown id, with a way back', () => {
    seedEvents([{ name: 'Some other event' }]);

    render(<EventDetailView eventId="nope" />);

    expect(screen.getByText(/doesn't exist/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to events/i })).toHaveAttribute(
      'href',
      '/events',
    );
  });
});
