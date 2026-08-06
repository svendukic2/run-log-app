import { deriveInsights, derivePastPlans, formatWeekRange } from './insights';
import type { Run } from './runs';

// Reference day: Wed 5 Aug 2026. The insight window is the four *full*
// Mon-Sun weeks Jul 6-12, Jul 13-19, Jul 20-26 and Jul 27-Aug 2; the prior
// window ("last month") is Jun 8 through Jul 5. The running week Aug 3-9 is
// excluded everywhere.
const TODAY = '2026-08-05';

let nextId = 0;

function makeRun(overrides: Partial<Run> = {}): Run {
  nextId += 1;
  return {
    id: `run-${nextId}`,
    routeName: 'Morning loop',
    distanceKm: 10,
    durationSeconds: 3000,
    date: '2026-07-28',
    effort: 'Medium',
    note: '',
    ...overrides,
  };
}

function insight(runs: Run[], key: string, isoToday = TODAY) {
  const found = deriveInsights(runs, 20, isoToday).find((entry) => entry.key === key);
  if (!found) throw new Error(`no ${key} insight`);
  return found;
}

describe('deriveInsights (RUN-34)', () => {
  it('returns the three cards in the designed order (AC1)', () => {
    const labels = deriveInsights([makeRun()], 20, TODAY).map((entry) => entry.label);
    expect(labels).toEqual(['Recent load', 'Pace trend', 'Consistency']);
  });

  describe('recent load', () => {
    it('sums the four full weeks, ignoring the running week and older runs', () => {
      const runs = [
        makeRun({ date: '2026-07-28', distanceKm: 10.24 }),
        // The running week belongs to the live plan card, not the window.
        makeRun({ date: '2026-08-04', distanceKm: 5 }),
        // Jun 20 sits in the prior window.
        makeRun({ date: '2026-06-20', distanceKm: 40 }),
      ];

      expect(insight(runs, 'load').value).toBe('10.2 km');
    });

    it('reports the same numbers on Monday as at the end of the week', () => {
      // The window never contains a half-finished week, so nothing dips on
      // Monday morning: 3 runs a week reads 3 / week on any weekday.
      const dates = ['2026-07-07', '2026-07-08', '2026-07-14', '2026-07-15'];
      const runs = dates.map((date) => makeRun({ date, distanceKm: 10 }));

      const monday = deriveInsights(runs, 20, '2026-08-03');
      const friday = deriveInsights(runs, 20, '2026-08-07');
      expect(monday).toEqual(friday);
      expect(monday[0].value).toBe('40 km');
    });

    it('leaves a single active week unjudged', () => {
      const runs = [makeRun({ date: '2026-07-28' }), makeRun({ date: '2026-07-30' })];

      expect(insight(runs, 'load').caption).toBe('Over the last 4 full weeks');
    });

    it.each([
      ['two similar weeks', [5, 6], 'steady'],
      ['a gentle build-up', [10, 10, 10, 11], 'steady'],
      ['one week towering over the rest', [10, 10, 10, 25], 'spike'],
      ['tiny distances, whatever the ratio', [1, 2], 'steady'],
    ])('calls %s %s', (_label, weeklyKm, verdict) => {
      const weekStarts = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27'];
      const runs = weeklyKm.map((distanceKm, index) =>
        makeRun({ date: weekStarts[weekStarts.length - weeklyKm.length + index], distanceKm }),
      );

      expect(insight(runs, 'load').caption).toBe(
        verdict === 'spike'
          ? 'Includes a spike week in the last 4 full weeks'
          : 'Steady over the last 4 full weeks, no spikes',
      );
    });
  });

  describe('pace trend', () => {
    it('shows the window pace with no prior month to compare', () => {
      const runs = [makeRun({ date: '2026-07-28', distanceKm: 10, durationSeconds: 3000 })];

      const pace = insight(runs, 'pace');
      expect(pace.value).toBe('5:00 /km');
      expect(pace.caption).toBe('Your first month of pace data');
    });

    it('reports getting faster against the prior month', () => {
      const runs = [
        makeRun({ date: '2026-06-24', durationSeconds: 3300 }),
        makeRun({ date: '2026-07-28', durationSeconds: 3000 }),
      ];

      // 330 s/km down to 300 s/km is a 9% drop of the prior pace.
      expect(insight(runs, 'pace').caption).toBe('9% faster than last month');
    });

    it('reports getting slower against the prior month', () => {
      const runs = [
        makeRun({ date: '2026-06-24', durationSeconds: 3000 }),
        makeRun({ date: '2026-07-28', durationSeconds: 3300 }),
      ];

      expect(insight(runs, 'pace').caption).toBe('10% slower than last month');
    });

    it('treats a drift under 2% as level, not a trend', () => {
      const runs = [
        makeRun({ date: '2026-06-24', durationSeconds: 3000 }),
        makeRun({ date: '2026-07-28', durationSeconds: 3030 }),
      ];

      expect(insight(runs, 'pace').caption).toBe('Level with last month');
    });

    it('never fabricates a pace from an empty window', () => {
      // A run exists, but only in the running week: no full-week distance,
      // no pace.
      const runs = [makeRun({ date: '2026-08-04' })];

      const pace = insight(runs, 'pace');
      expect(pace.value).toBe('No pace yet');
      expect(pace.caption).toBe('Nothing logged in the last 4 full weeks');
    });

    it('survives a corrupt zero-duration prior month', () => {
      const runs = [
        makeRun({ date: '2026-06-24', durationSeconds: 0 }),
        makeRun({ date: '2026-07-28', durationSeconds: 3000 }),
      ];

      // A zero prior pace cannot be compared against; no "Infinity% slower".
      expect(insight(runs, 'pace').caption).toBe('Your first month of pace data');
    });
  });

  describe('consistency', () => {
    it('judges the displayed runs-per-week against the plan bracket', () => {
      // Three runs in each full week: 3 / week against a 3-4 session
      // bracket (last week ran 3 times).
      const dates = [
        '2026-07-07',
        '2026-07-08',
        '2026-07-09',
        '2026-07-14',
        '2026-07-15',
        '2026-07-16',
        '2026-07-21',
        '2026-07-22',
        '2026-07-23',
        '2026-07-28',
        '2026-07-29',
        '2026-07-30',
      ];
      const runs = dates.map((date) => makeRun({ date, distanceKm: 5 }));

      const consistency = insight(runs, 'consistency');
      expect(consistency.value).toBe('3 / week');
      expect(consistency.caption).toBe('Right on your planned cadence');
    });

    it('reports running ahead of the planned cadence', () => {
      // Last week held one run (a 1-2 session bracket) but the month
      // averages 3 runs a week.
      const dates = [
        '2026-07-07',
        '2026-07-08',
        '2026-07-09',
        '2026-07-10',
        '2026-07-14',
        '2026-07-15',
        '2026-07-16',
        '2026-07-17',
        '2026-07-21',
        '2026-07-22',
        '2026-07-23',
        '2026-07-28',
      ];
      const runs = dates.map((date) => makeRun({ date, distanceKm: 5 }));

      const consistency = insight(runs, 'consistency');
      expect(consistency.value).toBe('3 / week');
      expect(consistency.caption).toBe('Ahead of your planned cadence');
    });

    it('shows a fractional cadence instead of rounding it away', () => {
      // Two runs across four full weeks is 0.5 / week, not "1 / week".
      const runs = [makeRun({ date: '2026-07-21' }), makeRun({ date: '2026-07-23' })];

      const consistency = insight(runs, 'consistency');
      expect(consistency.value).toBe('0.5 / week');
      expect(consistency.caption).toBe('Below your planned cadence');
    });
  });
});

describe('formatWeekRange', () => {
  it.each([
    ['within one month', '2026-06-22', 'Jun 22 – 28'],
    ['across a month boundary', '2026-06-29', 'Jun 29 – Jul 5'],
    ['across a year boundary', '2025-12-29', 'Dec 29 – Jan 4'],
  ])('formats a week %s', (_label, weekStart, formatted) => {
    expect(formatWeekRange(weekStart)).toBe(formatted);
  });
});

describe('derivePastPlans (RUN-34)', () => {
  it('recomputes a past week the way its live plan derived (AC2)', () => {
    const runs = [
      makeRun({ date: '2026-07-21', distanceKm: 10 }),
      makeRun({ date: '2026-07-28', distanceKm: 12 }),
    ];

    expect(derivePastPlans(runs, 20, TODAY)).toEqual([
      {
        weekStart: '2026-07-27',
        label: 'Jul 27 – Aug 2',
        targetKm: 11,
        ranKm: 12,
        hit: true,
      },
    ]);
  });

  it('marks a week that fell short as missed (AC3)', () => {
    const runs = [
      makeRun({ date: '2026-07-21', distanceKm: 10 }),
      makeRun({ date: '2026-07-28', distanceKm: 5 }),
    ];

    expect(derivePastPlans(runs, 20, TODAY)[0]).toMatchObject({
      targetKm: 11,
      ranKm: 5,
      hit: false,
    });
  });

  it('judges the chip on the numbers the row displays (AC3 boundary)', () => {
    const runs = [
      makeRun({ date: '2026-07-21', distanceKm: 10 }),
      // 10.96 rounds to 11.0: the row reads "Target 11 km · ran 11 km", so
      // the chip must agree and say Hit.
      makeRun({ date: '2026-07-28', distanceKm: 10.96 }),
    ];

    expect(derivePastPlans(runs, 20, TODAY)[0]).toMatchObject({ ranKm: 11, hit: true });
  });

  it('derives a past target only from the runs that preceded it', () => {
    const runs = [
      makeRun({ date: '2026-07-08', distanceKm: 10 }),
      makeRun({ date: '2026-07-15', distanceKm: 12 }),
      makeRun({ date: '2026-07-22', distanceKm: 20 }),
    ];

    const plans = derivePastPlans(runs, 20, TODAY);
    expect(plans.map((plan) => plan.weekStart)).toEqual([
      '2026-07-27',
      '2026-07-20',
      '2026-07-13',
    ]);
    // The oldest row steps up its own reference week (10 km), untouched by
    // the 20 km logged later: history never rewrites itself.
    expect(plans[2]).toMatchObject({ targetKm: 11, ranKm: 12, hit: true });
    expect(plans[1]).toMatchObject({ targetKm: 13, ranKm: 20, hit: true });
    expect(plans[0]).toMatchObject({ targetKm: 22, ranKm: 0, hit: false });
  });

  it('stops at the first week without a derivable plan, leaving no holes', () => {
    // A rest week two weeks back: the history ends there rather than
    // skipping over it and presenting a gapped list as contiguous.
    const runs = [
      makeRun({ date: '2026-07-08', distanceKm: 8 }),
      makeRun({ date: '2026-07-28', distanceKm: 12 }),
    ];

    // The newest past week (Jul 27) follows the empty Jul 20 week: no row,
    // and nothing older is shown either.
    expect(derivePastPlans(runs, 20, TODAY)).toEqual([]);
  });

  it('never uses the goal to invent history for a week after a rest week', () => {
    // Only the current week has runs: no past week has a derivable plan,
    // whatever the goal says.
    const runs = [makeRun({ date: '2026-08-04' })];

    expect(derivePastPlans(runs, 999, TODAY)).toEqual([]);
  });

  it('caps the history at three rows', () => {
    const runs = [
      makeRun({ date: '2026-07-01', distanceKm: 8 }),
      makeRun({ date: '2026-07-08', distanceKm: 8 }),
      makeRun({ date: '2026-07-15', distanceKm: 8 }),
      makeRun({ date: '2026-07-21', distanceKm: 8 }),
      makeRun({ date: '2026-07-28', distanceKm: 8 }),
    ];

    expect(derivePastPlans(runs, 20, TODAY)).toHaveLength(3);
  });
});
