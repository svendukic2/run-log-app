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
const TOMORROW = shiftDay(TODAY, 1);

describe('EventsView (RUN-68)', () => {
  it('groups cards by state, Active first, with the card facts (AC1)', () => {
    seedEvents([
      { name: 'Last month classic', startDate: shiftDay(TODAY, -8), endDate: shiftDay(TODAY, -1) },
      { name: 'Summer 100k', endDate: TOMORROW, targetKm: 100, participantCount: 3 },
      { name: 'Next week dash', startDate: TOMORROW, endDate: shiftDay(TOMORROW, 7) },
    ]);

    render(<EventsView />);

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Active1', 'Upcoming1', 'Finished1']);

    const card = screen
      .getAllByTestId('event-card')
      .find((candidate) => within(candidate).queryByText('Summer 100k'))!;
    expect(within(card).getByText('Active')).toBeInTheDocument();
    expect(within(card).getByText(/3 runners/)).toBeInTheDocument();
    expect(within(card).getByText(/Target 100 km/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Summer 100k' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/events\//),
    );
  });

  it('shows the empty state whose CTA opens the create modal (AC4)', async () => {
    const user = userEvent.setup();
    render(<EventsView />);

    expect(screen.getByText('No events yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create your first event/i }));

    expect(screen.getByRole('dialog', { name: 'Create event' })).toBeInTheDocument();
  });

  it('flips Join to Joined without a reload and hides the action on owned events (AC2)', async () => {
    const user = userEvent.setup();
    seedEvents([
      { name: 'Summer 100k', endDate: TOMORROW },
      { name: 'My event', mine: true },
    ]);

    render(<EventsView />);
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByRole('button', { name: 'Joined' })).toBeInTheDocument();
    expect(screen.getByText(/2 runners/)).toBeInTheDocument();
    // The owner's membership is structural, so their card offers no action.
    expect(screen.getByText('Your event')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('keeps the card and shows an inline alert when the join fails', async () => {
    const user = userEvent.setup();
    seedEvents([{ name: 'Summer 100k', endDate: TOMORROW }]);
    failEventsApi('POST', 500);

    render(<EventsView />);
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/500/);
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(screen.getByText(/1 runner\b/)).toBeInTheDocument();
  });
});
