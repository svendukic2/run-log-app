import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { currentWeekStart, shiftWeek, type LeaderboardEntry } from '@/lib/leaderboard';
import { seedLeaderboard } from '@/test/leaderboardApiMock';
import LeaderboardView from './LeaderboardView';

const THIS_WEEK = currentWeekStart();
const LAST_WEEK = shiftWeek(THIS_WEEK, -1);

function board() {
  return within(screen.getByRole('region', { name: 'Weekly ranking' }));
}

describe('LeaderboardView (RUN-70)', () => {
  it('ranks the week by km with rank, initials, name, runs and distance (AC1, AC5)', () => {
    seedLeaderboard(THIS_WEEK, [
      { firstName: 'Ana', rank: 1, totalKm: 42, runCount: 4 },
      { firstName: 'Bruno', rank: 2, totalKm: 12.5, runCount: 2, me: true },
    ]);

    render(<LeaderboardView />);

    const rows = board().getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Ana Tester'),
      expect.stringContaining('Bruno Tester'),
    ]);
    expect(within(rows[0]).getByText('AT')).toBeInTheDocument();
    expect(within(rows[0]).getByText('42 km')).toBeInTheDocument();
    expect(within(rows[0]).getByText('4 runs')).toBeInTheDocument();
    // My row is marked, and every row opens that runner's profile (AC5).
    expect(within(rows[1]).getByText('You')).toBeInTheDocument();
    expect(board().getByRole('link', { name: /Ana Tester/ })).toHaveAttribute(
      'href',
      '/people/user-ana',
    );
  });

  it('pins my row with my real rank when I rank below the served ones (AC2)', () => {
    const me: LeaderboardEntry = {
      id: 'user-me',
      firstName: 'Marko',
      lastName: 'Tester',
      rank: 51,
      totalKm: 3,
      runCount: 1,
      me: true,
    };
    seedLeaderboard(THIS_WEEK, [{ firstName: 'Ana', rank: 1, totalKm: 42, runCount: 4 }], {
      me,
      total: 51,
    });

    render(<LeaderboardView />);

    const rows = board().getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('Marko Tester');
    expect(rows[1]).toHaveTextContent('51');
    expect(board().getByText(/Showing the top 1 of 51 ranked runners/)).toBeInTheDocument();
  });

  it('tells me I am not on the board and links to Settings when I am opted out (AC3)', () => {
    seedLeaderboard(THIS_WEEK, [{ firstName: 'Ana', rank: 1, totalKm: 42, runCount: 4 }], {
      me: null,
    });

    render(<LeaderboardView />);

    expect(board().getByText(/You're not on the leaderboard/)).toBeInTheDocument();
    expect(board().getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    // Still absent from the rows themselves, not merely warned about.
    expect(board().queryByText('You')).not.toBeInTheDocument();
  });

  it('recomputes the ranking for the week the switcher picks (AC4)', async () => {
    seedLeaderboard(LAST_WEEK, [{ firstName: 'Carla', rank: 1, totalKm: 30, runCount: 3 }]);
    // Seeded last so the store opens on the current week, as a first visit
    // does.
    seedLeaderboard(THIS_WEEK, [{ firstName: 'Ana', rank: 1, totalKm: 42, runCount: 4 }]);

    render(<LeaderboardView />);
    expect(board().getByText('42 km')).toBeInTheDocument();
    // The current week is the newest one there is, so there is nothing to
    // step forward into.
    expect(screen.getByRole('button', { name: /Next week/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /Previous week/ }));

    await waitFor(() => expect(board().getByText('30 km')).toBeInTheDocument());
    expect(board().queryByText('42 km')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next week/ })).toBeEnabled();
  });
});
