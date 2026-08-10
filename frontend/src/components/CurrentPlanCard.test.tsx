import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { getAppliedGoal, getDefaultGoal, saveGoal } from '@/lib/goal';
import { getPlanGeneratedAt, stampPlanGenerated } from '@/lib/plan';
import { addRun, todayIso, type Run } from '@/lib/runs';
import CurrentPlanCard from './CurrentPlanCard';

function seedRun(overrides: Partial<Omit<Run, 'id'>> = {}): Run {
  return addRun({
    routeName: 'Morning loop',
    distanceKm: 10,
    durationSeconds: 3000,
    date: todayIso(),
    effort: 'Medium',
    note: '',
    ...overrides,
  });
}

describe('Current plan card (RUN-32)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the header, the updated caption and Regenerate (AC1)', () => {
    seedRun();

    render(<CurrentPlanCard />);

    const card = screen.getByRole('region', { name: "This week's plan" });
    expect(within(card).getByText(/updated just now/)).toBeInTheDocument();
    // Regeneration is RUN-35: present, announced as not yet available.
    const regenerate = within(card).getByRole('button', { name: 'Regenerate' });
    expect(regenerate).toHaveAttribute('aria-disabled', 'true');
    expect(regenerate).toHaveAccessibleDescription(
      'Not available yet: regenerating arrives in an upcoming update.',
    );
  });

  it('respects a stored generation stamp in the caption (A16)', () => {
    stampPlanGenerated(Date.now() - 2 * 3_600_000);
    seedRun();

    render(<CurrentPlanCard />);

    expect(screen.getByText(/updated 2h ago/)).toBeInTheDocument();
  });

  it('stamps the first generation once and keeps it (A16, AC4)', () => {
    seedRun();
    expect(getPlanGeneratedAt()).toBeNull();

    const { unmount } = render(<CurrentPlanCard />);
    const stamped = getPlanGeneratedAt();
    expect(stamped).not.toBeNull();
    unmount();

    render(<CurrentPlanCard />);
    expect(getPlanGeneratedAt()).toBe(stamped);
  });

  it('derives the first plan from the weekly goal (AC2)', () => {
    saveGoal({ km: 20, startDate: todayIso(), endDate: null });
    seedRun({ distanceKm: 5 });

    render(<CurrentPlanCard />);

    expect(screen.getByText('Aim for 20 km this week')).toBeInTheDocument();
    expect(screen.getByText(/Your first plan starts from your weekly goal\./)).toBeInTheDocument();
    // No last week to compare against.
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('steps a real last week up by 10% and shows all four stats (AC2, AC3)', () => {
    // Wed 5 Aug 2026; last week (Jul 27-Aug 2) holds two 10 km runs.
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 9, 0));
    seedRun({ date: '2026-07-28' });
    seedRun({ date: '2026-07-30', routeName: 'River trail' });

    render(<CurrentPlanCard />);

    expect(screen.getByText('Aim for 22 km this week')).toBeInTheDocument();
    expect(screen.getByText(/a \+10% step up from last week/)).toBeInTheDocument();

    const card = screen.getByRole('region', { name: "This week's plan" });
    const labels = within(card)
      .getAllByRole('term')
      .map((dt) => dt.textContent);
    expect(labels).toEqual(['Suggested target', 'Vs last week', 'Sessions', 'Key workout']);
    expect(within(card).getByText('22 km')).toBeInTheDocument();
    expect(within(card).getByText('+10%')).toBeInTheDocument();
    expect(within(card).getByText('2-3')).toBeInTheDocument();
    expect(within(card).getByText('1 tempo')).toBeInTheDocument();
  });

  it('follows the runs store: a new run moves the plan (no stale snapshot)', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 9, 0));
    seedRun({ date: '2026-07-28' });
    render(<CurrentPlanCard />);
    expect(screen.getByText('Aim for 11 km this week')).toBeInTheDocument();

    act(() => {
      seedRun({ date: '2026-07-30', routeName: 'River trail' });
    });

    expect(screen.getByText('Aim for 22 km this week')).toBeInTheDocument();
  });

  it('applies the suggested target to this week and stays on the page (RUN-33, AC1)', () => {
    // Wed 5 Aug 2026; last week holds 20 km, so the plan suggests 22 km.
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 9, 0));
    seedRun({ date: '2026-07-28' });
    seedRun({ date: '2026-07-30', routeName: 'River trail' });

    render(<CurrentPlanCard />);
    fireEvent.click(screen.getByRole('button', { name: /apply to weekly goal/i }));

    // The click wrote this week's applied record (AC1/AC2: the dashboard
    // goal card resolves through it; precedence is goal.test.ts territory).
    expect(getAppliedGoal()).toEqual({ km: 22, weekStart: '2026-08-03' });
    // The Settings default is untouched: only this week's target moved.
    expect(getDefaultGoal()).toBeNull();
    // No navigation happens: the card is still here, suggestion unchanged.
    expect(screen.getByText('Aim for 22 km this week')).toBeInTheDocument();
  });

  it('offers Apply as a live control and keeps the reasoning link inert (AC3)', () => {
    seedRun();

    render(<CurrentPlanCard />);

    const apply = screen.getByRole('button', { name: /apply to weekly goal/i });
    expect(apply).not.toHaveAttribute('aria-disabled');
    const reasoning = screen.getByRole('button', { name: 'See the reasoning' });
    expect(reasoning).toHaveAttribute('aria-disabled', 'true');
    expect(reasoning).toHaveAccessibleDescription('Not available yet.');
    // A21: clicking the reasoning link does nothing in the first build; in
    // particular it must not apply the target the way the primary action does.
    fireEvent.click(reasoning);
    expect(getAppliedGoal()).toBeNull();
    expect(getDefaultGoal()).toBeNull();
  });

  it('renders an empty server shell before hydration', () => {
    seedRun();

    // Runs live in localStorage; the server ships nothing.
    expect(renderToString(<CurrentPlanCard />)).toBe('');
  });
});
