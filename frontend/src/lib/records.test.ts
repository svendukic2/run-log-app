import { deriveRecords, RECORD_KINDS } from './records';
import type { Run } from './runs';

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    routeName: 'Morning loop',
    distanceKm: 8.2,
    durationSeconds: 2535,
    date: '2026-07-14',
    effort: 'Medium',
    note: '',
    ...overrides,
  };
}

// Paces: Long run 5:33 /km, Tempo run 4:51 /km, Steady five 5:00 /km.
// Weeks (Mon-first): Jun 22 holds 14.2 km, Jun 29 holds 5 + 8 = 13 km.
const LONG_RUN = makeRun({
  id: 'long',
  routeName: 'Long run',
  distanceKm: 14.2,
  durationSeconds: 4724,
  date: '2026-06-24',
  effort: 'Hard',
});
const STEADY = makeRun({
  id: 'steady',
  routeName: 'Steady five',
  distanceKm: 5,
  durationSeconds: 1500,
  date: '2026-06-29',
  effort: 'Easy',
});
const TEMPO = makeRun({
  id: 'tempo',
  routeName: 'Tempo run',
  distanceKm: 8,
  durationSeconds: 2328,
  date: '2026-07-01',
});

const record = (runs: Run[], kind: string) =>
  deriveRecords(runs).find((candidate) => candidate.kind === kind);

describe('deriveRecords (RUN-26)', () => {
  it('derives all six records in card order (AC1)', () => {
    const records = deriveRecords([LONG_RUN, STEADY, TEMPO]);

    expect(records.map((r) => r.kind)).toEqual([...RECORD_KINDS]);
    expect(records.map(({ label, value, caption }) => ({ label, value, caption }))).toEqual([
      { label: 'Longest run', value: '14.2 km', caption: 'Long run · Jun 24' },
      // Tempo's 4:51 /km held for 5 km; faster than Steady's straight 25:00.
      { label: 'Fastest 5K', value: '24:15', caption: 'Tempo run · Jul 1' },
      // Only the 14.2 km run qualifies for 10K.
      { label: 'Fastest 10K', value: '55:27', caption: 'Long run · Jun 24' },
      { label: 'Best pace', value: '4:51 /km', caption: 'Tempo run · Jul 1' },
      { label: 'Biggest week', value: '14.2 km', caption: 'Week of Jun 22' },
      // No two dates are consecutive, so the streak is a single day.
      { label: 'Longest streak', value: '1 day', caption: 'Jun 24' },
    ]);
  });

  it('recomputes from whatever runs it is given (AC2)', () => {
    expect(record([LONG_RUN], 'longest-run')?.value).toBe('14.2 km');

    const edited = { ...LONG_RUN, distanceKm: 21.1 };
    expect(record([edited], 'longest-run')?.value).toBe('21.1 km');
    expect(deriveRecords([])).toEqual([]);
  });

  it('hides a record type with no qualifying run (AC3, A24)', () => {
    // No run of 10K or more: the ticket's own example.
    const kinds = deriveRecords([STEADY, TEMPO]).map((r) => r.kind);
    expect(kinds).not.toContain('fastest-10k');
    expect(kinds).toContain('fastest-5k');

    // Nothing reaches 5K either: both fastest cards go.
    const short = makeRun({ distanceKm: 3.2, durationSeconds: 1000 });
    expect(deriveRecords([short]).map((r) => r.kind)).toEqual([
      'longest-run',
      'best-pace',
      'biggest-week',
      'longest-streak',
    ]);
  });

  it('credits the first run to set a record on a tie', () => {
    const first = makeRun({ id: 'a', routeName: 'First ten', distanceKm: 10, date: '2026-06-24' });
    const second = makeRun({
      id: 'b',
      routeName: 'Second ten',
      distanceKm: 10,
      date: '2026-06-29',
    });

    // Store order is newest first; the credit still goes to the earlier run.
    expect(record([second, first], 'longest-run')?.caption).toBe('First ten · Jun 24');
  });

  it('counts a streak of consecutive days, once per day (AC1)', () => {
    const streak = [
      '2026-06-17',
      '2026-06-18',
      '2026-06-19',
      '2026-06-20',
      '2026-06-21',
      '2026-06-22',
    ];
    const runs = [
      ...streak.map((date) => makeRun({ id: date, date })),
      // A second run on a streak day must not count twice.
      makeRun({ id: 'double', date: '2026-06-18' }),
      makeRun({ id: 'later', date: '2026-06-24' }),
    ];

    expect(record(runs, 'longest-streak')).toMatchObject({
      value: '6 days',
      caption: 'Jun 17 – 22',
    });
  });

  it('spells out both months when a streak crosses one', () => {
    const runs = [
      makeRun({ id: 'a', date: '2026-06-30' }),
      makeRun({ id: 'b', date: '2026-07-01' }),
    ];

    expect(record(runs, 'longest-streak')).toMatchObject({
      value: '2 days',
      caption: 'Jun 30 – Jul 1',
    });
  });

  it('keeps the earliest of equally long streaks', () => {
    const runs = ['2026-06-01', '2026-06-02', '2026-06-10', '2026-06-11'].map((date) =>
      makeRun({ id: date, date }),
    );

    expect(record(runs, 'longest-streak')?.caption).toBe('Jun 1 – 2');
  });

  it('sums each Mon-Sun week for the biggest week', () => {
    // Jun 28 is a Sunday, Jun 29 the next Monday: 6 + 6 in one week beats a
    // single 10 in another, but the same 12 split across the boundary loses.
    const sameWeek = [
      makeRun({ id: 'a', distanceKm: 6, date: '2026-06-22' }),
      makeRun({ id: 'b', distanceKm: 6, date: '2026-06-28' }),
      makeRun({ id: 'c', distanceKm: 10, date: '2026-06-29' }),
    ];
    expect(record(sameWeek, 'biggest-week')).toMatchObject({
      value: '12.0 km',
      caption: 'Week of Jun 22',
    });

    const splitWeek = [
      makeRun({ id: 'a', distanceKm: 6, date: '2026-06-28' }),
      makeRun({ id: 'b', distanceKm: 6, date: '2026-06-29' }),
      makeRun({ id: 'c', distanceKm: 10, date: '2026-07-08' }),
    ];
    expect(record(splitWeek, 'biggest-week')).toMatchObject({
      value: '10.0 km',
      caption: 'Week of Jul 6',
    });
  });
});
