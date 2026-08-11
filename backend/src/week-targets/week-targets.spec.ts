import { BadRequestException } from '@nestjs/common';
import { WeekStartPipe } from './week-start.pipe';
import { currentWeekCandidates } from './week-targets.service';

describe('WeekStartPipe', () => {
  const pipe = new WeekStartPipe();

  it('passes a real Monday through unchanged', () => {
    // 2026-08-03 is a Monday.
    expect(pipe.transform('2026-08-03')).toBe('2026-08-03');
  });

  it.each([
    ['a Tuesday', '2026-08-04'],
    ['a Sunday', '2026-08-09'],
    ['an impossible day', '2026-02-31'],
    ['a non-date', 'not-a-date'],
    ['a full timestamp', '2026-08-03T00:00:00Z'],
  ])('rejects %s (%s) with a 400', (_label, value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });

  it('names the correct Monday in the non-Monday error', () => {
    expect(() => pipe.transform('2026-08-05')).toThrow('2026-08-03');
  });
});

describe('currentWeekCandidates', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function at(instant: string): string[] {
    jest.useFakeTimers().setSystemTime(new Date(instant));
    return currentWeekCandidates();
  }

  it('is one Monday mid-week', () => {
    // Wednesday 5 Aug 2026, midday UTC: every timezone's "today" falls in
    // the same Monday-anchored week.
    expect(at('2026-08-05T12:00:00.000Z')).toEqual(['2026-08-03']);
  });

  // The window in which two Mondays are honest answers opens when UTC+14
  // (Kiritimati) enters the new week and closes when UTC-12 (Baker Island)
  // leaves the old one: Sunday 10:00 UTC to Monday 12:00 UTC, 26 hours.
  it('still answers one Monday just before UTC+14 enters the new week', () => {
    expect(at('2026-08-09T09:59:00.000Z')).toEqual(['2026-08-03']);
  });

  it('opens to two Mondays the moment UTC+14 crosses into Monday', () => {
    expect(at('2026-08-09T10:00:00.000Z')).toEqual([
      '2026-08-03',
      '2026-08-10',
    ]);
  });

  it('keeps both Mondays while UTC-12 is still in Sunday', () => {
    expect(at('2026-08-10T11:59:00.000Z')).toEqual([
      '2026-08-03',
      '2026-08-10',
    ]);
  });

  it('closes to the new Monday once UTC-12 reaches it too', () => {
    expect(at('2026-08-10T12:00:00.000Z')).toEqual(['2026-08-10']);
  });

  it('is one Monday on a plain Tuesday', () => {
    expect(at('2026-08-11T12:00:00.000Z')).toEqual(['2026-08-10']);
  });
});
