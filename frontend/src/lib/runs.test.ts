import {
  addRun,
  emptyRunForm,
  formatDate,
  formatDuration,
  formatPace,
  getRuns,
  parseDuration,
  sortRuns,
  startOfWeek,
  toRunDraft,
  totalsForWeek,
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
