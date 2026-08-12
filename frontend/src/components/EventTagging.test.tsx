import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getRuns, todayIso } from '@/lib/runs';
import {
  failTaggableEvents,
  makeEventRunsLoadFail,
  restoreEventRunsApi,
  seedEventRuns,
  seedEvents,
  seedParticipants,
} from '@/test/eventsApiMock';
import { seedRuns } from '@/test/runsApiMock';
import EventDetailView from './EventDetailView';
import RunModal from './RunModal';

// Tagging a run to an event (RUN-76), driven through the two screens that own
// it: the run form's picker and the event page's run feed.
//
// The mocks mirror the SERVER rules rather than accepting what the form sends -
// eventsApiMock derives the picker's options from the seeded events, and
// runsApiMock 400s a tag the real API would refuse. That is deliberate: a mock
// that accepted any eventId would turn "every save of a tagged run is a 400"
// into a green suite.

const TODAY = todayIso();
// A window that certainly contains today, and one day certainly outside it.
const WINDOW = { startDate: '2026-01-01', endDate: '2099-12-31' };
const OUTSIDE = '2025-12-31';

type EventDraft = Parameters<typeof seedEvents>[0][number];

function seedJoinedEvent(overrides: Partial<EventDraft> = {}) {
  const [event] = seedEvents([
    { name: 'Summer 100k', joined: true, ...WINDOW, ...overrides } as EventDraft,
  ]);
  return event;
}

async function fillValidRun(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Route name'), 'Evening tempo');
  await user.type(screen.getByLabelText('Distance (km)'), '8.2');
  await user.type(screen.getByLabelText('Duration'), '42:15');
}

const picker = () => screen.getByLabelText('Event (optional)');

// Two steps since RUN-54: Next validates the details, Save stores the run.
async function saveRun(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^next$/i }));
  await user.click(screen.getByRole('button', { name: /^save run$/i }));
}

describe('Tagging a run to an event (RUN-76 AC1)', () => {
  it('offers the joined events covering the run’s date, and stores the choice', async () => {
    const event = seedJoinedEvent();
    // Not offered: one the runner has not joined, and one whose window ended
    // before today. Both are seeded so the filter has something to exclude.
    seedEvents([
      { name: 'Not mine', joined: false, ...WINDOW },
      { name: 'Last winter', joined: true, startDate: '2025-01-01', endDate: '2025-02-01' },
    ]);
    const user = userEvent.setup();
    render(<RunModal onClose={jest.fn()} />);

    // The options arrive from the API, so the field starts with No event only.
    await waitFor(() =>
      expect(within(picker()).getByRole('option', { name: 'Summer 100k' })).toBeInTheDocument(),
    );
    expect(within(picker()).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'No event',
      'Summer 100k',
    ]);

    await fillValidRun(user);
    await user.selectOptions(picker(), event.id);
    await saveRun(user);

    await waitFor(() => expect(getRuns()).toHaveLength(1));
    expect(getRuns()[0].eventId).toBe(event.id);
  });

  it('starts an edit on the run’s stored event and can clear it (AC6)', async () => {
    const event = seedJoinedEvent();
    const [run] = seedRuns([
      {
        routeName: 'Morning loop',
        distanceKm: 8.2,
        durationSeconds: 2535,
        date: TODAY,
        effort: 'Medium',
        note: '',
        eventId: event.id,
      },
    ]);
    const user = userEvent.setup();
    render(<RunModal run={run} onClose={jest.fn()} />);

    await waitFor(() => expect(picker()).toHaveValue(event.id));

    // "No event" is how a tag is removed, and it has to survive the save: the
    // draft sends null rather than omitting the key.
    await user.selectOptions(picker(), '');
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: /^save changes$/i }));

    await waitFor(() => expect(getRuns()[0].eventId).toBeNull());
  });

  // The case the form has to handle or the save 400s: the chosen event does not
  // cover the new date. Clearing it silently would be an invisible untag, so it
  // is announced.
  it('clears the tag when the date moves outside the event, and says so', async () => {
    const event = seedJoinedEvent();
    const user = userEvent.setup();
    render(<RunModal onClose={jest.fn()} />);

    await waitFor(() =>
      expect(within(picker()).getByRole('option', { name: 'Summer 100k' })).toBeInTheDocument(),
    );
    await fillValidRun(user);
    await user.selectOptions(picker(), event.id);

    // A date input rejects partial values as they are typed, so it is set whole.
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: OUTSIDE } });

    // The announcement is what proves the tag was dropped by the DATE change:
    // waiting on the value alone would pass the moment the options were
    // re-read, before the form state caught up.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /not covered by an event you have joined/i,
      ),
    );
    expect(picker()).toHaveValue('');
    // And the field says there is nothing to choose, rather than offering an
    // option the server would reject.
    expect(within(picker()).getAllByRole('option')).toHaveLength(1);
  });

  it('reports a failed options read inline and still saves the run untagged', async () => {
    seedJoinedEvent();
    failTaggableEvents(500);
    const user = userEvent.setup();
    render(<RunModal onClose={jest.fn()} />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/still save this run/i));

    // The point: an event tag is optional, so its options failing to load costs
    // the tag and never the run.
    await fillValidRun(user);
    await saveRun(user);

    await waitFor(() => expect(getRuns()).toHaveLength(1));
    expect(getRuns()[0].eventId).toBeNull();
  });

  // The review finding: with the options unavailable, the field used to render
  // "No event" while the form still held the stored tag - and the disabled
  // control left no way to clear it, so the save was a guaranteed 400.
  it('keeps a stored tag selectable and clearable when the options fail to load', async () => {
    const event = seedJoinedEvent();
    const [run] = seedRuns([
      {
        routeName: 'Morning loop',
        distanceKm: 8.2,
        durationSeconds: 2535,
        date: TODAY,
        effort: 'Medium',
        note: '',
        eventId: event.id,
      },
    ]);
    failTaggableEvents(500);
    const user = userEvent.setup();
    render(<RunModal run={run} onClose={jest.fn()} />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // The tag the form is holding is what the field shows, and the control is
    // live: those two together are the fix.
    expect(picker()).toHaveValue(event.id);
    expect(picker()).toBeEnabled();

    await user.selectOptions(picker(), '');
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: /^save changes$/i }));

    await waitFor(() => expect(getRuns()[0].eventId).toBeNull());
  });

  it('offers nothing when no joined event covers the date (AC7)', async () => {
    seedEvents([{ name: 'Not mine', joined: false, ...WINDOW }]);
    const user = userEvent.setup();
    render(<RunModal onClose={jest.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(/have not joined an event covering this date/i)).toBeInTheDocument(),
    );
    expect(picker()).toBeDisabled();

    await fillValidRun(user);
    await saveRun(user);

    await waitFor(() => expect(getRuns()).toHaveLength(1));
    expect(getRuns()[0].eventId).toBeNull();
  });
});

describe('The event’s run feed (RUN-76 AC2)', () => {
  it('lists the tagged runs with runner, date, distance and duration', () => {
    const event = seedJoinedEvent({ participantCount: 2 });
    seedParticipants(event.id, [{ firstName: 'Ana', rank: 1, totalKm: 12, runCount: 1 }]);
    seedEventRuns(event.id, [
      {
        distanceKm: 12,
        date: '2026-08-11',
        durationSeconds: 3600,
        runner: { id: 'user-ana', firstName: 'Ana', lastName: 'Tester' },
      },
      {
        distanceKm: 5.5,
        date: '2026-08-10',
        durationSeconds: 1650,
        runner: { id: 'user-bruno', firstName: 'Bruno', lastName: 'Tester' },
      },
    ]);

    render(<EventDetailView eventId={event.id} />);

    const feed = within(screen.getByRole('region', { name: /Runs in this event/ }));
    const rows = feed.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Ana Tester');
    expect(rows[0].textContent).toContain('12.0 km');
    expect(rows[0].textContent).toContain('1:00:00');
    expect(rows[0].textContent).toContain('Aug 11');
    // The row opens that runner's profile, like the participants card's rows.
    expect(feed.getByRole('link', { name: /Bruno Tester/ })).toHaveAttribute(
      'href',
      '/people/user-bruno',
    );
  });

  it('says an untagged event has no runs rather than looking broken', () => {
    const event = seedJoinedEvent();
    seedParticipants(event.id, [{ firstName: 'Ana', rank: 1 }]);
    seedEventRuns(event.id, []);

    render(<EventDetailView eventId={event.id} />);

    expect(screen.getByText(/No runs yet/i)).toBeInTheDocument();
  });

  it('fails and retries on its own, without taking the leaderboard down', async () => {
    const event = seedJoinedEvent();
    seedParticipants(event.id, [{ firstName: 'Ana', rank: 1, totalKm: 12, runCount: 1 }]);
    makeEventRunsLoadFail(500);
    const user = userEvent.setup();

    render(<EventDetailView eventId={event.id} />);

    const feed = within(screen.getByRole('region', { name: /Runs in this event/ }));
    await waitFor(() => expect(feed.getByRole('alert')).toBeInTheDocument());
    // The two cards read separately, which is the whole reason the feed is not
    // inside the participants boundary.
    const board = within(screen.getByRole('region', { name: 'Leaderboard' }));
    expect(board.getAllByRole('listitem')).toHaveLength(1);
    expect(board.getByText('12 km')).toBeInTheDocument();

    restoreEventRunsApi();
    seedEventRuns(event.id, [{ distanceKm: 12 }]);
    await user.click(feed.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(feed.getAllByRole('listitem')).toHaveLength(1));
  });
});
