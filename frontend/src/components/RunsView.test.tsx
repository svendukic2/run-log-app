import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RunsView from './RunsView';
import { addRun, type Run } from '@/lib/runs';
import { seedRuns } from '@/test/runsApiMock';

// Row clicks navigate imperatively; the route-name links do not need the rest
// of next/navigation in a jsdom test.
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const RUNS: Run[] = [
  {
    id: 'run-newest',
    routeName: 'Morning loop',
    distanceKm: 8.2,
    durationSeconds: 2535, // 42:15
    date: '2026-07-07',
    effort: 'Medium',
    note: '',
  },
  {
    id: 'run-middle',
    routeName: 'River trail',
    distanceKm: 5.4,
    durationSeconds: 1720,
    date: '2026-07-05',
    effort: 'Easy',
    note: '',
  },
  {
    id: 'run-oldest',
    routeName: 'Long run',
    distanceKm: 14.2,
    durationSeconds: 4724, // 1:18:44
    date: '2026-06-24',
    effort: 'Hard',
    note: '',
  },
];

// The route column holds the only links in the table, so their order is the
// row order.
function tableRouteOrder(): Array<string | null> {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('link')
    .map((link) => link.textContent);
}

describe('Runs view (RUN-24)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
  });

  it('shows both tabs, the total count badge and the controls (AC2, AC7)', () => {
    seedRuns(RUNS);
    render(<RunsView />);

    const allRuns = screen.getByRole('tab', { name: /all runs/i });
    expect(allRuns).toHaveAttribute('aria-selected', 'true');
    expect(within(allRuns).getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Records' })).toHaveAttribute('aria-selected', 'false');

    expect(screen.getByLabelText('Sort runs')).toHaveValue('newest');
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('keeps the table unchanged when Filter is pressed (AC7, A19)', async () => {
    seedRuns(RUNS);
    const user = userEvent.setup();
    render(<RunsView />);

    await user.click(screen.getByRole('button', { name: 'Filter' }));

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(tableRouteOrder()).toEqual(['Morning loop', 'River trail', 'Long run']);
  });

  it('renders every column, the effort chips and a kebab per row (AC3)', () => {
    seedRuns(RUNS);
    render(<RunsView />);

    for (const column of ['Route', 'Date', 'Distance', 'Duration', 'Pace', 'Effort']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(column, 'i') })).toBeVisible();
    }

    const table = screen.getByRole('table');
    // One chip per row on top of the effort dots: the chip carries the label.
    expect(within(table).getByText('Easy')).toBeInTheDocument();
    expect(within(table).getByText('Medium')).toBeInTheDocument();
    expect(within(table).getByText('Hard')).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: /open menu for/i })).toHaveLength(3);
  });

  it('orders newest first by default and reverses on "Oldest first" (AC4)', async () => {
    seedRuns(RUNS);
    const user = userEvent.setup();
    render(<RunsView />);

    expect(tableRouteOrder()).toEqual(['Morning loop', 'River trail', 'Long run']);

    await user.selectOptions(screen.getByLabelText('Sort runs'), 'oldest');
    expect(tableRouteOrder()).toEqual(['Long run', 'River trail', 'Morning loop']);

    await user.selectOptions(screen.getByLabelText('Sort runs'), 'newest');
    expect(tableRouteOrder()).toEqual(['Morning loop', 'River trail', 'Long run']);
  });

  it('shows hour-long durations as h:mm:ss (AC5)', () => {
    seedRuns(RUNS);
    render(<RunsView />);

    const table = screen.getByRole('table');
    expect(within(table).getByText('1:18:44')).toBeInTheDocument();
    expect(within(table).getByText('42:15')).toBeInTheDocument();
  });

  it('opens run detail from the row but not from the kebab (AC6)', async () => {
    seedRuns(RUNS);
    const user = userEvent.setup();
    render(<RunsView />);

    const table = screen.getByRole('table');
    const [firstRow] = within(table).getAllByTestId('run-row');

    // Click the row itself (a plain cell), not the route-name link.
    await user.click(within(firstRow).getByText('Jul 7, 2026'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/runs/run-newest');

    await user.click(within(firstRow).getByRole('button', { name: /open menu for/i }));
    expect(push).toHaveBeenCalledTimes(1);

    // The route name doubles as a real link for keyboard and screen readers.
    expect(within(firstRow).getByRole('link', { name: 'Morning loop' })).toHaveAttribute(
      'href',
      '/runs/run-newest',
    );
  });

  it('opens the Edit run modal from the row menu without navigating (RUN-29)', async () => {
    seedRuns(RUNS);
    const user = userEvent.setup();
    render(<RunsView />);

    const table = screen.getByRole('table');
    const [firstRow] = within(table).getAllByTestId('run-row');

    await user.click(within(firstRow).getByRole('button', { name: /open menu for/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    // The modal opens for that exact run and nothing navigated: every click
    // inside the menu subtree stays out of the row's onClick.
    expect(screen.getByRole('dialog', { name: 'Edit run' })).toBeInTheDocument();
    expect(screen.getByLabelText('Route name')).toHaveValue('Morning loop');
    expect(push).not.toHaveBeenCalled();
  });

  it('swaps the table for the records panel and back (AC2)', async () => {
    seedRuns(RUNS);
    const user = userEvent.setup();
    render(<RunsView />);

    expect(screen.getByTestId('record-cards')).not.toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Records' }));
    // Both panels stay mounted; `hidden` drops the table out of the
    // accessibility tree, which is what role queries see.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByTestId('record-cards')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Records' })).toHaveAttribute('aria-selected', 'true');

    // The badge keeps showing the total while Records is active.
    expect(within(screen.getByRole('tab', { name: /all runs/i })).getByText('3')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: /all runs/i }));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('moves between the tabs with the arrow keys', async () => {
    seedRuns(RUNS);
    const user = userEvent.setup();
    render(<RunsView />);

    screen.getByRole('tab', { name: /all runs/i }).focus();
    await user.keyboard('{ArrowRight}');

    const records = screen.getByRole('tab', { name: 'Records' });
    expect(records).toHaveFocus();
    expect(records).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: /all runs/i })).toHaveFocus();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders the same rows as cards for narrow screens (responsive addendum)', () => {
    seedRuns(RUNS);
    render(<RunsView />);

    const cards = screen.getByTestId('runs-cards');
    expect(within(cards).getAllByRole('listitem')).toHaveLength(3);
    expect(within(cards).getByText('Morning loop')).toBeInTheDocument();
    // Each card carries the same row menu the table rows have (RUN-29).
    expect(within(cards).getAllByRole('button', { name: /open menu for/i })).toHaveLength(3);
    expect(within(cards).getByRole('link', { name: /long run/i })).toHaveAttribute(
      'href',
      '/runs/run-oldest',
    );
  });
});

describe('Records tab (RUN-26)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('derives the record cards from the stored runs (AC1)', async () => {
    seedRuns(RUNS);
    const user = userEvent.setup();
    render(<RunsView />);

    await user.click(screen.getByRole('tab', { name: 'Records' }));

    const cards = screen.getByTestId('record-cards');
    expect(within(cards).getByText('Longest run')).toBeVisible();
    // The 14.2 km run holds Longest run and its week holds Biggest week.
    expect(within(cards).getAllByText('14.2 km')).toHaveLength(2);
    expect(within(cards).getAllByText('Long run · Jun 24').length).toBeGreaterThan(0);
    // 14.2 km is the only run of 10K or more, so it holds the 10K record too.
    expect(within(cards).getByText('Fastest 10K')).toBeVisible();
  });

  it('recomputes the records when a run is saved (AC2)', async () => {
    seedRuns(RUNS);
    const user = userEvent.setup();
    render(<RunsView />);

    await user.click(screen.getByRole('tab', { name: 'Records' }));
    // Longest run and Fastest 10K are both credited to the 14.2 km run.
    expect(
      within(screen.getByTestId('record-cards')).getAllByText('Long run · Jun 24'),
    ).toHaveLength(2);

    await act(async () => {
      await addRun({
        routeName: 'Half marathon',
        distanceKm: 21.1,
        durationSeconds: 6600,
        date: '2026-07-08',
        effort: 'Hard',
        note: '',
      });
    });

    const cards = screen.getByTestId('record-cards');
    expect(within(cards).getByText('21.1 km')).toBeVisible();
    // The new run takes over Longest run and Fastest 10K alike.
    expect(within(cards).getAllByText('Half marathon · Jul 8')).toHaveLength(2);
    expect(within(cards).queryByText('Long run · Jun 24')).not.toBeInTheDocument();
  });
});

describe('Runs empty state (RUN-25)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the heading, the designed copy and a zero badge (AC1)', () => {
    render(<RunsView />);

    expect(screen.getByRole('heading', { name: 'No runs logged yet' })).toBeInTheDocument();
    expect(
      screen.getByText(
        /add your first run and it will show up here with distance, pace and effort\. your records fill in automatically\./i,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('tab', { name: /all runs/i })).getByText('0'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runs-cards')).not.toBeInTheDocument();
  });

  it('hides the Filter and sort controls (AC3)', () => {
    render(<RunsView />);

    expect(screen.queryByRole('button', { name: 'Filter' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sort runs')).not.toBeInTheDocument();
  });

  it('opens the Add run modal from "Add your first run" (AC2)', async () => {
    const user = userEvent.setup();
    render(<RunsView />);

    await user.click(screen.getByRole('button', { name: 'Add your first run' }));

    expect(screen.getByRole('dialog', { name: 'Add run' })).toHaveAttribute('aria-modal', 'true');
  });

  it('swaps the empty state for the table once the first run is saved (AC4)', async () => {
    render(<RunsView />);
    expect(screen.getByRole('heading', { name: 'No runs logged yet' })).toBeInTheDocument();

    // Saving through the modal ends in this addRun call; the form on top of
    // it is covered by the modal's own tests.
    await act(async () => {
      await addRun({
        routeName: 'Morning loop',
        distanceKm: 8.2,
        durationSeconds: 2535,
        date: '2026-07-07',
        effort: 'Medium',
        note: '',
      });
    });

    expect(screen.queryByRole('heading', { name: 'No runs logged yet' })).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sort runs')).toBeInTheDocument();
    expect(
      within(screen.getByRole('tab', { name: /all runs/i })).getByText('1'),
    ).toBeInTheDocument();
    // The CTA that had focus just unmounted; the tab picks the focus up
    // instead of letting it fall to <body>.
    expect(screen.getByRole('tab', { name: /all runs/i })).toHaveFocus();
  });
});
