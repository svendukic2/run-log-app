import {
  addRun,
  daysLeftInWeek,
  deleteRun,
  emptyRunForm,
  formatDate,
  formatDateShort,
  formatDistanceKm,
  formatDuration,
  formatDurationMinutes,
  formatPace,
  formatTimeCompact,
  formatKm,
  getRuns,
  lastWeekStarts,
  parseDuration,
  roundKm,
  runToForm,
  sortRuns,
  startOfWeek,
  toRunDraft,
  totalsForWeek,
  updateRun,
  validateRunForm,
  type Run,
  type RunFormValues,
} from './runs';

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

function makeForm(overrides: Partial<RunFormValues> = {}): RunFormValues {
  return {
    routeName: 'Morning loop',
    distance: '8.2',
    duration: '42:15',
    date: '2026-07-14',
    effort: 'Medium',
    note: '',
    ...overrides,
  };
}

describe('parseDuration (RUN-23 AC5, ADD-6)', () => {
  it.each([
    ['42:15', 2535],
    ['1:18:44', 4724],
    ['0:30', 30],
    // A long run may be entered without splitting the hours out.
    ['90:00', 5400],
  ])('accepts %s', (input, seconds) => {
    expect(parseDuration(input)).toBe(seconds);
  });

  it.each(['', '42', '42:', ':15', '42:1:5:9', 'abc', '42:75', '1:75:00', '4 2:15', '-5:00'])(
    'rejects %p',
    (input) => {
      expect(parseDuration(input)).toBeNull();
    },
  );
});

describe('formatting', () => {
  it.each([
    [2535, '42:15'],
    [4724, '1:18:44'],
    [30, '0:30'],
    [3600, '1:00:00'],
  ])('renders %i seconds as %s', (seconds, formatted) => {
    expect(formatDuration(seconds)).toBe(formatted);
  });

  it('renders the date the way the designs write it', () => {
    expect(formatDate('2026-07-14')).toBe('Jul 14, 2026');
  });

  // Recent-runs card captions (RUN-20, DSH-8).
  it('renders the short date without a year', () => {
    expect(formatDateShort('2026-07-07')).toBe('Jul 7');
  });

  it.each([
    [2535, '42 min'],
    [29, '0 min'],
    [90, '2 min'],
  ])('renders %i seconds as "%s" in the minutes caption', (seconds, formatted) => {
    expect(formatDurationMinutes(seconds)).toBe(formatted);
  });

  it.each([
    [8.2, '8.2 km'],
    [5, '5.0 km'],
  ])('renders %f km as "%s"', (km, formatted) => {
    expect(formatDistanceKm(km)).toBe(formatted);
  });

  // Shared rounding for goal readouts and chart bars (RUN-17, RUN-19, RUN-21).
  it.each([
    [0.0142857, 0],
    [0.04, 0],
    [0.05, 0.1],
    [19.96, 20],
    [13.649, 13.6],
  ])('rounds %f km to %f', (km, rounded) => {
    expect(roundKm(km)).toBe(rounded);
  });

  it.each([
    [0, '0'],
    [6, '6'],
    [19.95, '20'],
    [13.6, '13.6'],
    [0.5, '0.5'],
  ])('renders %f km as "%s" in goal readouts', (km, formatted) => {
    expect(formatKm(km)).toBe(formatted);
  });

  // The Weekly goal card's Time stat (RUN-17, DSH-5).
  it.each([
    [0, '0m'],
    [30, '1m'],
    [3540, '59m'],
    // 59.5 minutes rounds across the hour boundary.
    [3570, '1h 0m'],
    [3600, '1h 0m'],
    [4560, '1h 16m'],
    [4335, '1h 12m'],
  ])('compacts %i seconds to "%s"', (seconds, formatted) => {
    expect(formatTimeCompact(seconds)).toBe(formatted);
  });
});

describe('pace (AC5, ADD-4)', () => {
  it('divides duration by distance', () => {
    // 42:15 over 8.2 km is 309.1 s/km.
    expect(formatPace(makeRun())).toBe('5:09 /km');
  });

  it('handles the h:mm:ss shape the same way', () => {
    expect(formatPace(makeRun({ distanceKm: 14.2, durationSeconds: 4724 }))).toBe('5:33 /km');
  });
});

describe('weeks (AC6)', () => {
  it.each([
    // Tue 14 Jul 2026 and the Sunday closing the same week.
    ['2026-07-14', '2026-07-13'],
    ['2026-07-19', '2026-07-13'],
    // Monday opens its own week.
    ['2026-07-13', '2026-07-13'],
    ['2026-07-20', '2026-07-20'],
  ])('puts %s in the week starting %s', (date, monday) => {
    expect(startOfWeek(date)).toBe(monday);
  });

  // Every weekday of the week 2026-08-03 (Mon) .. 2026-08-09 (Sun), pinned so
  // the "{n} days left" caption (RUN-17) cannot drift off by one.
  it.each([
    ['2026-08-03', 7],
    ['2026-08-04', 6],
    ['2026-08-05', 5],
    ['2026-08-06', 4],
    ['2026-08-07', 3],
    ['2026-08-08', 2],
    ['2026-08-09', 1],
  ])('counts %s as having %i days of its week left', (date, expected) => {
    expect(daysLeftInWeek(date)).toBe(expected);
  });

  it('lists the last week starts oldest first, seven days apart (RUN-19)', () => {
    // Tue 14 Jul 2026 sits in the week of Mon 13 Jul.
    expect(lastWeekStarts('2026-07-14', 8)).toEqual([
      '2026-05-25',
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
      '2026-06-22',
      '2026-06-29',
      '2026-07-06',
      '2026-07-13',
    ]);
  });

  it('ends the week-start list with the current week even on a Monday', () => {
    expect(lastWeekStarts('2026-08-03', 2)).toEqual(['2026-07-27', '2026-08-03']);
  });

  it('treats a Sunday as closing its week, not opening the next', () => {
    // Sun 19 Jul 2026 belongs to the week of Mon 13 Jul.
    expect(lastWeekStarts('2026-07-19', 2)).toEqual(['2026-07-06', '2026-07-13']);
  });

  it('crosses a year boundary without skipping weeks', () => {
    // Mon 5 Jan 2026; three weeks back reaches into December 2025.
    expect(lastWeekStarts('2026-01-05', 4)).toEqual([
      '2025-12-15',
      '2025-12-22',
      '2025-12-29',
      '2026-01-05',
    ]);
  });

  it('totals only the runs in the requested week', () => {
    const runs = [
      makeRun({ id: 'a', date: '2026-07-14', distanceKm: 8.2, durationSeconds: 2535 }),
      makeRun({ id: 'b', date: '2026-07-16', distanceKm: 5, durationSeconds: 1500 }),
      // The week before, so none of this counts towards the current one.
      makeRun({ id: 'c', date: '2026-07-08', distanceKm: 20, durationSeconds: 7200 }),
    ];

    const thisWeek = totalsForWeek(runs, '2026-07-14');
    expect(thisWeek.runCount).toBe(2);
    expect(thisWeek.distanceKm).toBeCloseTo(13.2);
    expect(thisWeek.durationSeconds).toBe(4035);

    expect(totalsForWeek(runs, '2026-07-08')).toEqual({
      runCount: 1,
      distanceKm: 20,
      durationSeconds: 7200,
    });
  });
});

describe('validateRunForm (AC4, ADD-5, ADD-7)', () => {
  it('passes a fully filled form', () => {
    expect(validateRunForm(makeForm())).toEqual({});
  });

  it('leaves the note optional', () => {
    expect(validateRunForm(makeForm({ note: '' }))).toEqual({});
  });

  it.each([
    ['routeName', makeForm({ routeName: '   ' })],
    ['distance', makeForm({ distance: '' })],
    ['distance', makeForm({ distance: '0' })],
    ['distance', makeForm({ distance: '-3' })],
    ['distance', makeForm({ distance: 'far' })],
    ['duration', makeForm({ duration: '' })],
    ['duration', makeForm({ duration: '0:00' })],
    ['duration', makeForm({ duration: 'ages' })],
    ['date', makeForm({ date: '' })],
    ['date', makeForm({ date: '2999-01-01' })],
  ])('flags %s', (field, values) => {
    expect(validateRunForm(values)).toHaveProperty(field);
  });

  it('accepts today but rejects tomorrow (RUN-23 AC7)', () => {
    const today = new Date();
    const iso = (date: Date) =>
      `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    expect(validateRunForm(makeForm({ date: iso(today) }))).toEqual({});
    expect(validateRunForm(makeForm({ date: iso(tomorrow) }))).toHaveProperty(
      'date',
      'Date cannot be in the future',
    );
  });

  it('reports every problem at once', () => {
    const errors = validateRunForm(makeForm({ routeName: '', distance: '0', duration: '' }));
    expect(Object.keys(errors).sort()).toEqual(['distance', 'duration', 'routeName']);
  });
});

describe('toRunDraft', () => {
  it('trims text, parses the numbers and keeps pace out of the record', () => {
    const draft = toRunDraft(
      makeForm({ routeName: '  Evening tempo ', duration: '1:18:44', note: ' felt good ' }),
    );

    expect(draft).toEqual({
      routeName: 'Evening tempo',
      distanceKm: 8.2,
      durationSeconds: 4724,
      date: '2026-07-14',
      effort: 'Medium',
      note: 'felt good',
    });
  });

  it('accepts a comma as the decimal separator', () => {
    expect(toRunDraft(makeForm({ distance: '8,2' })).distanceKm).toBe(8.2);
  });
});

describe('runToForm (RUN-28 AC1)', () => {
  it('renders a stored run back into the shapes the form uses', () => {
    expect(runToForm(makeRun({ note: 'Windy' }))).toEqual(
      makeForm({ routeName: 'Morning loop', note: 'Windy' }),
    );
  });

  it('writes a duration over an hour as h:mm:ss', () => {
    expect(runToForm(makeRun({ durationSeconds: 4724 })).duration).toBe('1:18:44');
  });

  it('round-trips through toRunDraft without drift', () => {
    const run = makeRun();
    expect({ ...toRunDraft(runToForm(run)), id: run.id }).toEqual(run);
  });
});

describe('emptyRunForm (AC1)', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 14, 9, 30));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('prefills today and preselects Medium', () => {
    expect(emptyRunForm()).toEqual({
      routeName: '',
      distance: '',
      duration: '',
      date: '2026-07-14',
      effort: 'Medium',
      note: '',
    });
  });
});

describe('store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts empty and keeps what it is given', () => {
    expect(getRuns()).toEqual([]);

    const saved = addRun(toRunDraft(makeForm()));

    expect(getRuns()).toEqual([saved]);
    expect(saved.id).toEqual(expect.any(String));
  });

  it('returns the newest run first whatever order they were entered in', () => {
    addRun(toRunDraft(makeForm({ routeName: 'Older', date: '2026-07-01' })));
    addRun(toRunDraft(makeForm({ routeName: 'Newer', date: '2026-07-20' })));

    expect(getRuns().map((run) => run.routeName)).toEqual(['Newer', 'Older']);
  });

  it('ignores stored junk rather than crashing the page', () => {
    window.localStorage.setItem('runlog.runs', '{ not json');
    expect(getRuns()).toEqual([]);

    window.localStorage.setItem('runlog.runs', JSON.stringify([{ id: 'x' }, makeRun()]));
    expect(getRuns()).toEqual([makeRun()]);
  });

  it('updateRun replaces the run in place and keeps its id (RUN-28 AC2)', () => {
    const other = addRun(toRunDraft(makeForm({ routeName: 'Other', date: '2026-07-01' })));
    const target = addRun(toRunDraft(makeForm()));

    const updated = updateRun(
      target.id,
      toRunDraft(makeForm({ routeName: 'Corrected', distance: '10' })),
    );

    expect(updated).toEqual({ ...target, routeName: 'Corrected', distanceKm: 10 });
    // Still two runs: an edit never duplicates, and the other run is untouched.
    expect(getRuns()).toEqual([updated, other]);
  });

  it('updateRun re-files the run when the edit moves its date', () => {
    const other = addRun(toRunDraft(makeForm({ routeName: 'Other', date: '2026-07-10' })));
    const target = addRun(toRunDraft(makeForm({ date: '2026-07-14' })));

    updateRun(target.id, toRunDraft(makeForm({ date: '2026-07-01' })));

    // Newest-first ordering follows the corrected date.
    expect(getRuns().map((run) => run.id)).toEqual([other.id, target.id]);
  });

  it('updateRun writes nothing when the id matches no run', () => {
    const run = addRun(toRunDraft(makeForm()));

    expect(updateRun('missing', toRunDraft(makeForm({ routeName: 'Ghost' })))).toBeNull();
    expect(getRuns()).toEqual([run]);
  });

  it('deleteRun removes exactly that run and keeps the rest (RUN-30 AC2)', () => {
    const other = addRun(toRunDraft(makeForm({ routeName: 'Other', date: '2026-07-01' })));
    const target = addRun(toRunDraft(makeForm()));

    expect(deleteRun(target.id)).toBe(true);

    expect(getRuns()).toEqual([other]);
  });

  it('deleteRun announces the change so derived screens recompute (DEL-3)', () => {
    const target = addRun(toRunDraft(makeForm()));
    const onChange = jest.fn();
    window.addEventListener('runlog:runs-changed', onChange);

    deleteRun(target.id);

    expect(onChange).toHaveBeenCalled();
    window.removeEventListener('runlog:runs-changed', onChange);
  });

  it('deleteRun writes nothing when the id matches no run', () => {
    const run = addRun(toRunDraft(makeForm()));

    expect(deleteRun('missing')).toBe(false);
    expect(getRuns()).toEqual([run]);
  });
});

describe('sortRuns (RUN-24 AC4)', () => {
  const runs = [
    makeRun({ id: 'older', date: '2026-06-24' }),
    makeRun({ id: 'newest', date: '2026-07-07' }),
    makeRun({ id: 'middle', date: '2026-07-05' }),
  ];

  it('puts the newest run first', () => {
    expect(sortRuns(runs, 'newest').map((run) => run.id)).toEqual(['newest', 'middle', 'older']);
  });

  it('reverses to oldest first', () => {
    expect(sortRuns(runs, 'oldest').map((run) => run.id)).toEqual(['older', 'middle', 'newest']);
  });

  it('leaves the given array untouched', () => {
    const before = [...runs];
    sortRuns(runs, 'oldest');
    expect(runs).toEqual(before);
  });

  it('keeps same-day runs in their stored order under either sort', () => {
    const sameDay = [
      makeRun({ id: 'stored-first', date: '2026-07-07' }),
      makeRun({ id: 'stored-second', date: '2026-07-07' }),
      makeRun({ id: 'older', date: '2026-06-24' }),
    ];

    expect(sortRuns(sameDay, 'newest').map((run) => run.id)).toEqual([
      'stored-first',
      'stored-second',
      'older',
    ]);
    expect(sortRuns(sameDay, 'oldest').map((run) => run.id)).toEqual([
      'older',
      'stored-first',
      'stored-second',
    ]);
  });
});
