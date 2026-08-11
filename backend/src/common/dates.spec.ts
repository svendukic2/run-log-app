import {
  addDaysIso,
  isRealCalendarDay,
  mondayOf,
  toDbDate,
  toIsoDate,
  utcTodayIso,
} from './dates';

describe('isRealCalendarDay', () => {
  it.each([
    ['a normal day', '2026-07-14', true],
    ['a real past leap day', '2024-02-29', true],
    ['Feb 29 of a non-leap year', '2026-02-29', false],
    ['Feb 31, which Date silently rolls over', '2026-02-31', false],
    ['a zeroth day', '2026-07-00', false],
    ['a 13th month', '2026-13-01', false],
    ['a non-zero-padded shape', '2026-1-1', false],
    ['a full ISO timestamp', '2026-07-14T00:00:00Z', false],
    ['a null', null, false],
    ['a number', 20260714, false],
  ])('%s (%s) -> %s', (_label, value, expected) => {
    expect(isRealCalendarDay(value)).toBe(expected);
  });
});

describe('toDbDate / toIsoDate', () => {
  it('round-trips a calendar day exactly through UTC midnight', () => {
    const date = toDbDate('2026-07-14');
    expect(date.toISOString()).toBe('2026-07-14T00:00:00.000Z');
    expect(toIsoDate(date)).toBe('2026-07-14');
  });
});

describe('addDaysIso', () => {
  it.each([
    ['a plain step', '2026-07-14', 1, '2026-07-15'],
    ['a negative step', '2026-07-14', -1, '2026-07-13'],
    ['a month boundary', '2026-07-31', 1, '2026-08-01'],
    ['a year boundary', '2026-12-31', 1, '2027-01-01'],
    ['a leap February', '2024-02-28', 1, '2024-02-29'],
    ['a week back across months', '2026-08-03', -7, '2026-07-27'],
  ])('%s: %s %+d days -> %s', (_label, iso, days, expected) => {
    expect(addDaysIso(iso, days)).toBe(expected);
  });
});

describe('mondayOf', () => {
  // 2026-08-03 is a Monday.
  it.each([
    ['a Monday maps to itself', '2026-08-03', '2026-08-03'],
    ['a Tuesday', '2026-08-04', '2026-08-03'],
    ['a Saturday', '2026-08-08', '2026-08-03'],
    ['a Sunday belongs to the week BEHIND it', '2026-08-09', '2026-08-03'],
    ['a Monday across a month boundary', '2026-08-01', '2026-07-27'],
  ])('%s (%s -> %s)', (_label, iso, expected) => {
    expect(mondayOf(iso)).toBe(expected);
  });
});

describe('utcTodayIso', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // Midday UTC agrees with every local zone, so only the two midnight
  // straddles can catch an accidental local getter.
  it('stays on the UTC day just before UTC midnight', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T23:59:00.000Z'));
    expect(utcTodayIso()).toBe('2026-08-05');
  });

  it('advances with the UTC day just after UTC midnight', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-06T00:01:00.000Z'));
    expect(utcTodayIso()).toBe('2026-08-06');
  });
});
