import {
  derivePlan,
  derivePlanReasoning,
  formatUpdatedAgo,
  getPlanGeneratedAt,
  stampPlanGenerated,
} from './plan';
import type { Run } from './runs';

const NOW = 1_700_000_000_000;

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    routeName: 'Morning loop',
    distanceKm: 10,
    durationSeconds: 3000,
    date: '2026-07-28',
    effort: 'Medium',
    note: '',
    ...overrides,
  };
}

describe('derivePlan (RUN-32)', () => {
  // Reference day: Wed 5 Aug 2026; the previous Mon-Sun week is Jul 27-Aug 2.
  const TODAY = '2026-08-05';

  it('steps last week up by 10% and brackets its session count', () => {
    const runs = [
      makeRun({ id: 'a', date: '2026-07-28', distanceKm: 10 }),
      makeRun({ id: 'b', date: '2026-07-30', distanceKm: 10 }),
    ];

    const plan = derivePlan(runs, 20, TODAY);

    expect(plan.targetKm).toBe(22);
    expect(plan.vsLastWeekPercent).toBe(10);
    expect(plan.sessionsMin).toBe(2);
    expect(plan.sessionsMax).toBe(3);
    expect(plan.keyWorkout).toBe('1 tempo');
  });

  it('starts from the weekly goal when last week is empty (first plan)', () => {
    // The only run is this week: nothing to step up from.
    const runs = [makeRun({ date: '2026-08-04', distanceKm: 5 })];

    const plan = derivePlan(runs, 20, TODAY);

    expect(plan.targetKm).toBe(20);
    expect(plan.vsLastWeekPercent).toBeNull();
    // One run so far this week brackets to 1-2 sessions.
    expect(plan.sessionsMin).toBe(1);
    expect(plan.sessionsMax).toBe(2);
  });

  it('reports the step the rounded target actually delivers, not the factor', () => {
    // 3 km last week: 3.3 rounds back to 3, an honest +0%.
    const flat = derivePlan([makeRun({ distanceKm: 3 })], 20, TODAY);
    expect(flat.targetKm).toBe(3);
    expect(flat.vsLastWeekPercent).toBe(0);

    // 0.5 km last week floors to the 1 km minimum: an honest +100%.
    const floored = derivePlan([makeRun({ distanceKm: 0.5 })], 20, TODAY);
    expect(floored.targetKm).toBe(1);
    expect(floored.vsLastWeekPercent).toBe(100);
  });

  it('treats a logged 0 km week as no distance but keeps its session count', () => {
    const runs = [makeRun({ distanceKm: 0 })];

    const plan = derivePlan(runs, 20, TODAY);

    // Target falls back to the goal, with no percentage to fabricate.
    expect(plan.targetKm).toBe(20);
    expect(plan.vsLastWeekPercent).toBeNull();
    // The session bracket still reflects that one run happened last week.
    expect(plan.sessionsMin).toBe(1);
  });

  it('caps the session suggestion at a 6-7 bracket', () => {
    const runs = Array.from({ length: 9 }, (_, i) =>
      makeRun({ id: `r${i}`, date: '2026-07-28', distanceKm: 2 }),
    );

    const plan = derivePlan(runs, 20, TODAY);

    expect(plan.sessionsMin).toBe(6);
    expect(plan.sessionsMax).toBe(7);
  });

  it('never suggests a 0 km target', () => {
    const plan = derivePlan([], 0.2, TODAY);
    expect(plan.targetKm).toBeGreaterThanOrEqual(1);
  });
});

describe('derivePlanReasoning (RUN-33 AC3)', () => {
  const TODAY = '2026-08-05';

  it('restates the step-up plan in the plan card’s own numbers', () => {
    const runs = [
      makeRun({ id: 'a', date: '2026-07-28', distanceKm: 10 }),
      makeRun({ id: 'b', date: '2026-07-30', distanceKm: 10 }),
    ];

    const lines = derivePlanReasoning(runs, 20, TODAY);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('You ran 20 km last week');
    // The quoted step comes from vsLastWeekPercent, matching the card's stat.
    expect(lines[0]).toContain('stepping that up 10%');
    expect(lines[0]).toContain("this week's 22 km target");
    expect(lines[1]).toContain('2 times last week');
    expect(lines[1]).toContain('2-3 sessions');
  });

  it('explains the goal fallback when last week is empty', () => {
    const runs = [makeRun({ date: '2026-08-04', distanceKm: 5 })];

    const lines = derivePlanReasoning(runs, 20, TODAY);

    expect(lines[0]).toContain('rounded to 20 km');
    expect(lines[1]).toContain('1-2 session bracket');
  });
});

describe('formatUpdatedAgo', () => {
  it.each([
    [0, 'just now'],
    [59_000, 'just now'],
    [60_000, '1m ago'],
    [59 * 60_000, '59m ago'],
    [60 * 60_000, '1h ago'],
    [2 * 3_600_000, '2h ago'],
    [23 * 3_600_000, '23h ago'],
    [24 * 3_600_000, '1d ago'],
    [3 * 86_400_000, '3d ago'],
  ])('formats %i ms as "%s"', (elapsed, formatted) => {
    expect(formatUpdatedAgo(NOW - elapsed, NOW)).toBe(formatted);
  });

  it('treats a clock that ran backwards as just now', () => {
    expect(formatUpdatedAgo(NOW + 5_000, NOW)).toBe('just now');
  });
});

describe('plan generation stamp', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips the stamp through localStorage and reports success', () => {
    expect(stampPlanGenerated(NOW)).toBe(true);
    expect(getPlanGeneratedAt()).toBe(NOW);
  });

  it.each([
    ['not JSON', 'nope'],
    ['a non-object', '42'],
    ['a missing stamp', '{}'],
    ['a string stamp', JSON.stringify({ generatedAt: 'yesterday' })],
    ['a non-positive stamp', JSON.stringify({ generatedAt: 0 })],
  ])('reads %s as never generated', (_label, raw) => {
    window.localStorage.setItem('runlog.plan', raw);
    expect(getPlanGeneratedAt()).toBeNull();
  });

  it('survives setItem throwing and reports the failure (A22)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(stampPlanGenerated(NOW)).toBe(false);
    setItem.mockRestore();
    expect(getPlanGeneratedAt()).toBeNull();
    // The failure is traceable outside production, never fully silent.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('dispatches the change event only after a successful write', () => {
    const listener = jest.fn();
    window.addEventListener('runlog:plan-changed', listener);

    stampPlanGenerated(NOW);
    expect(listener).toHaveBeenCalledTimes(1);

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    stampPlanGenerated(NOW);
    setItem.mockRestore();
    warn.mockRestore();

    // Subscribers must never be told about a write that did not happen.
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('runlog:plan-changed', listener);
  });
});
