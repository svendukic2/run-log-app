import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { saveGoal } from '@/lib/goal';
import { todayIso, type Run } from '@/lib/runs';
import { seedRuns } from '@/test/runsApiMock';
import CoachTeaserCard from './CoachTeaserCard';

// Before render only: seeds the backend and primes the store cache.
function seedRun(overrides: Partial<Omit<Run, 'id'>> = {}): Run {
  return seedRuns([
    {
      routeName: 'Morning loop',
      distanceKm: 8,
      durationSeconds: 2400,
      date: todayIso(),
      effort: 'Medium',
      note: '',
      ...overrides,
    },
  ])[0];
}

function seedGoal(km: number) {
  saveGoal({ km, startDate: todayIso(), endDate: null });
}

describe('AI Coach teaser card (RUN-21)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('invites the first run with the designed copy when no runs exist (AC1)', () => {
    render(<CoachTeaserCard />);

    const card = screen.getByRole('region', { name: 'AI Coach' });
    expect(
      within(card).getByText(
        "Your coach is warming up. Log your first run and I'll start suggesting weekly targets and pacing tips tailored to you.",
      ),
    ).toBeInTheDocument();
    const button = within(card).getByRole('button', { name: /add your first run/i });
    // The card variant keeps the pill full width at every breakpoint.
    expect(button).not.toHaveClass('sm:w-auto');
    expect(within(card).queryByRole('link', { name: /open coach/i })).toBeNull();
  });

  it('opens the Add run modal from the empty-state button (AC1)', async () => {
    const user = userEvent.setup();
    render(<CoachTeaserCard />);

    await user.click(screen.getByRole('button', { name: /add your first run/i }));

    expect(screen.getByRole('dialog', { name: 'Add run' })).toBeInTheDocument();
  });

  it('links "Open coach" to the AI Coach page in the filled state (AC3)', () => {
    seedRun();

    render(<CoachTeaserCard />);

    const card = screen.getByRole('region', { name: 'AI Coach' });
    expect(within(card).getByRole('link', { name: /open coach/i })).toHaveAttribute(
      'href',
      '/coach',
    );
    expect(within(card).queryByRole('button', { name: /add your first run/i })).toBeNull();
  });

  it('renders an empty server shell before hydration', () => {
    seedRun();

    // The card's state lives in the client-side runs cache, which the server
    // cannot see, so the server ships nothing rather than flashing the empty
    // copy.
    expect(renderToString(<CoachTeaserCard />)).toBe('');
  });

  // The message wording depends on the weekday, so these pin the clock rather
  // than flipping outcomes with the day CI happens to run.
  describe('coach message (AC2)', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    function freezeAt(date: Date) {
      jest.useFakeTimers().setSystemTime(date);
    }

    it('references remaining km, days left and a daily plan mid-week', () => {
      // Wed 5 Aug 2026: 5 days of the Mon-Sun week left, counting today.
      freezeAt(new Date(2026, 7, 5, 9, 0));
      seedGoal(20);
      seedRun({ date: '2026-08-04', distanceKm: 14 });

      render(<CoachTeaserCard />);

      expect(
        screen.getByText(
          "You're 6 km from your goal with 5 days left. A steady 1.2 km a day keeps you on track.",
        ),
      ).toBeInTheDocument();
    });

    it('drops the "a day" phrasing on the last day of the week', () => {
      // Sun 9 Aug 2026: 1 day left; "a steady 6 km a day" would be nonsense.
      freezeAt(new Date(2026, 7, 9, 9, 0));
      seedGoal(20);
      seedRun({ date: '2026-08-04', distanceKm: 14 });

      render(<CoachTeaserCard />);

      expect(
        screen.getByText(
          "You're 6 km from your goal with 1 day left. 6 km today gets you there.",
        ),
      ).toBeInTheDocument();
    });

    it('never prescribes a 0 km day for a sub-kilometre remainder', () => {
      freezeAt(new Date(2026, 7, 5, 9, 0));
      seedGoal(20);
      seedRun({ date: '2026-08-04', distanceKm: 19.5 });

      render(<CoachTeaserCard />);

      expect(
        screen.getByText(
          "You're 0.5 km from your goal with 5 days left. One short run finishes it.",
        ),
      ).toBeInTheDocument();
    });

    it('keeps the message honest when the goal is already met', () => {
      freezeAt(new Date(2026, 7, 5, 9, 0));
      seedGoal(20);
      seedRun({ date: '2026-08-04', distanceKm: 25 });

      render(<CoachTeaserCard />);

      expect(
        screen.getByText(
          "You've hit your 20 km goal with 5 days left. Anything more this week is a bonus.",
        ),
      ).toBeInTheDocument();
    });

    it('falls back to the default 20 km target when no goal is stored', () => {
      freezeAt(new Date(2026, 7, 5, 9, 0));
      seedRun({ date: '2026-08-04', distanceKm: 14 });

      render(<CoachTeaserCard />);

      expect(screen.getByText(/You're 6 km from your goal/)).toBeInTheDocument();
    });

    it('coaches on the full goal when history exists but this week is empty', () => {
      freezeAt(new Date(2026, 7, 5, 9, 0));
      seedGoal(20);
      // The only run sits in the previous Mon-Sun week.
      seedRun({ date: '2026-07-28', distanceKm: 14 });

      render(<CoachTeaserCard />);

      // Not the warming-up copy: history exists, so the coach talks numbers.
      expect(screen.getByText(/You're 20 km from your goal with 5 days left/)).toBeInTheDocument();
      expect(screen.queryByText(/warming up/)).toBeNull();
    });
  });
});
