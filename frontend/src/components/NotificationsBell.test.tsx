import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PageHeader from './PageHeader';
import {
  failNotificationsApi,
  makeNotificationsLoadFail,
  seedNotifications,
} from '@/test/notificationsApiMock';

// The bell is rendered THROUGH the page header, not on its own: "the bell
// shows on any page" (AC1) is a claim about that wiring, and testing the
// component in isolation would not make it.
function renderHeader() {
  render(<PageHeader overline="Your activity" title="Runs" action={<button>Add run</button>} />);
}

const bell = () => screen.getByRole('button', { name: /^Notifications/ });
const panel = () => screen.getByRole('dialog', { name: 'Notifications' });

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(bell());
  return panel();
}

// One of each type, newest first (the mock ages each successive draft by an
// hour), so a single seed covers the per-type copy and the ordering.
function seedOneOfEach() {
  return seedNotifications([
    {
      type: 'new-follower',
      payload: { followerId: 'user-lukas', firstName: 'Lukas', lastName: 'Horvat' },
    },
    {
      type: 'followed-ran',
      payload: {
        runnerId: 'user-ana',
        firstName: 'Ana',
        lastName: 'Kovac',
        runId: 'run-42',
        routeName: 'River trail',
        distanceKm: 8.2,
        durationSeconds: 2535,
        date: '2026-08-10',
      },
    },
    {
      type: 'event-joined',
      payload: {
        joinerId: 'user-marko',
        firstName: 'Marko',
        lastName: 'Babic',
        eventId: 'event-7',
        eventName: 'August streak',
      },
    },
  ]);
}

describe('Notifications bell (RUN-66)', () => {
  beforeEach(() => {
    // jsdom has no layout, so the viewport the placement maths reads is
    // pinned to a sane size; the bell's rect stays at zeros.
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 1024,
      configurable: true,
    });
  });

  it('shows the unread indicator on any page while unread notifications exist (AC1)', () => {
    seedOneOfEach();
    renderHeader();

    expect(screen.getByTestId('notifications-unread-dot')).toBeInTheDocument();
    // The count is in the accessible name, so the dot can stay decorative.
    expect(bell()).toHaveAccessibleName('Notifications, 3 unread');
  });

  it('renders the rows newest first, per type, each linking where it points (AC2)', async () => {
    const user = userEvent.setup();
    seedOneOfEach();
    renderHeader();

    const rows = within(await openPanel(user)).getAllByRole('link');

    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Lukas Horvat started following you'),
      expect.stringContaining('Ana Kovac logged a run · 8.2 km'),
      expect.stringContaining('Marko Babic joined August streak'),
    ]);
    expect(rows[0]).toHaveAttribute('href', '/people/user-lukas');
    expect(rows[1]).toHaveAttribute('href', '/runs/run-42');
    expect(rows[2]).toHaveAttribute('href', '/events/event-7');
    // Relative time, not a date: these are ISO instants (the mock ages each
    // draft by an hour).
    expect(rows[1]).toHaveTextContent('1h ago');
  });

  it('clears the indicator and re-renders the rows as read on "Mark all as read" (AC3)', async () => {
    const user = userEvent.setup();
    seedOneOfEach();
    renderHeader();

    await openPanel(user);
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(screen.queryByTestId('notifications-unread-dot')).toBeNull());
    expect(bell()).toHaveAccessibleName('Notifications');
    // Nothing left to mark, so the action retires with the badge; the rows
    // stay, in their read styling.
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
    expect(within(panel()).getAllByRole('link')).toHaveLength(3);
    expect(within(panel()).getAllByRole('link')[0]).not.toHaveClass('bg-accent-soft/40');
  });

  it('keeps a failed mark-all visible instead of pretending the badge cleared', async () => {
    const user = userEvent.setup();
    seedOneOfEach();
    renderHeader();

    await openPanel(user);
    failNotificationsApi('POST');
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed/i);
    expect(screen.getByTestId('notifications-unread-dot')).toBeInTheDocument();
  });

  it('shows the empty message when there is nothing to show (AC4)', async () => {
    const user = userEvent.setup();
    renderHeader();

    expect(screen.queryByTestId('notifications-unread-dot')).toBeNull();
    expect(within(await openPanel(user)).getByText('Nothing new right now')).toBeInTheDocument();
  });

  it.each([
    [
      'Escape',
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.keyboard('{Escape}');
      },
    ],
    [
      'an outside click',
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByTestId('notifications-backdrop'));
      },
    ],
    [
      'a scroll',
      async () => {
        await act(async () => {
          window.dispatchEvent(new Event('scroll'));
        });
      },
    ],
  ])('closes on %s without navigating (AC5)', async (_gesture, dismiss) => {
    const user = userEvent.setup();
    seedOneOfEach();
    renderHeader();

    await openPanel(user);
    await dismiss(user);

    expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull();
    // Dismissing is not a row click: nothing was marked read and the page is
    // still the one the user was on.
    expect(screen.getByTestId('notifications-unread-dot')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Runs' })).toBeInTheDocument();
  });

  it('leaves the header working when its own read fails, with no indicator', async () => {
    const user = userEvent.setup();
    makeNotificationsLoadFail();
    renderHeader();

    // The page around it is untouched: the bell is nobody's reason for being
    // here, so its failure never gates the screen.
    expect(screen.getByRole('heading', { name: 'Runs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add run' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('notifications-unread-dot')).toBeNull());

    // The panel owns the failure, and offers the retry.
    await openPanel(user);
    expect(screen.getByText('Your notifications could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
