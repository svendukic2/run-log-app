import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { failEventsApi, seedEvents } from '@/test/eventsApiMock';
import { fromIsoDate, todayIso, toIsoDate } from '@/lib/runs';
import EventsView from './EventsView';

function shiftDay(iso: string, days: number): string {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

const TODAY = todayIso();
const YESTERDAY = shiftDay(TODAY, -1);
const TOMORROW = shiftDay(TODAY, 1);

describe('EventsView (RUN-68)', () => {
  it('groups cards by state, Active first, with the card facts (AC1)', () => {
    seedEvents([
      {
        name: 'Last month classic',
        startDate: shiftDay(YESTERDAY, -7),
        endDate: YESTERDAY,
      },
      {
        name: 'Summer 100k',
        startDate: TODAY,
        endDate: TOMORROW,
        targetKm: 100,
        participantCount: 3,
      },
      { name: 'Next week dash', startDate: TOMORROW, endDate: shiftDay(TOMORROW, 7) },
    ]);

    render(<EventsView />);

    // Section order is Active, Upcoming, Finished regardless of seed order.
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Active1', 'Upcoming1', 'Finished1']);

    const card = screen
      .getAllByTestId('event-card')
      .find((candidate) => within(candidate).queryByText('Summer 100k'))!;
    expect(within(card).getByText('Active')).toBeInTheDocument();
    expect(within(card).getByText(/3 runners/)).toBeInTheDocument();
    expect(within(card).getByText(/Target 100 km/)).toBeInTheDocument();
    expect(within(card).getByText('by Ana Tester')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Summer 100k' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/events\//),
    );
  });

  it('shows the designed empty state with the create call to action (AC4)', async () => {
    const user = userEvent.setup();
    render(<EventsView />);

    expect(screen.getByText('No events yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create your first event/i }));
    expect(screen.getByRole('dialog', { name: 'Create event' })).toBeInTheDocument();
  });

  it('flips Join to Joined without a reload and moves the count (AC2)', async () => {
    const user = userEvent.setup();
    seedEvents([{ name: 'Summer 100k', startDate: TODAY, endDate: TOMORROW }]);

    render(<EventsView />);
    expect(screen.getByText(/1 runner\b/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByRole('button', { name: 'Joined' })).toBeInTheDocument();
    expect(screen.getByText(/2 runners/)).toBeInTheDocument();
  });

  it('clicking Joined leaves again (AC2)', async () => {
    const user = userEvent.setup();
    seedEvents([
      {
        name: 'Summer 100k',
        startDate: TODAY,
        endDate: TOMORROW,
        joined: true,
        participantCount: 2,
      },
    ]);

    render(<EventsView />);
    await user.click(screen.getByRole('button', { name: 'Joined' }));

    expect(await screen.findByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(screen.getByText(/1 runner\b/)).toBeInTheDocument();
  });

  it('offers the owner no membership action (AC2 "except events I own")', () => {
    seedEvents([
      {
        name: 'My event',
        startDate: TODAY,
        endDate: TOMORROW,
        mine: true,
        joined: true,
      },
    ]);

    render(<EventsView />);

    expect(screen.getByText('Your event')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
  });

  it('keeps the card and shows an inline alert when the join fails', async () => {
    const user = userEvent.setup();
    seedEvents([{ name: 'Summer 100k', startDate: TODAY, endDate: TOMORROW }]);
    failEventsApi('POST', 500);

    render(<EventsView />);
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/500/);
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(screen.getByText(/1 runner\b/)).toBeInTheDocument();
  });
});
