import {
  getDefaultGoal,
  getDefaultGoalKm,
  nextWeekStart,
  resolveGoalTarget,
  saveDefaultGoal,
  saveGoal,
} from './goal';

// The week used throughout: Mon 2026-08-03 .. Sun 2026-08-09; the following
// week starts Mon 2026-08-10.
const WEDNESDAY = '2026-08-05';
const NEXT_MONDAY = '2026-08-10';

describe('default weekly goal (RUN-38)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('nextWeekStart', () => {
    it.each([
      ['a Monday', '2026-08-03'],
      ['a mid-week day', WEDNESDAY],
      ['a Sunday', '2026-08-09'],
    ])('returns the following Monday for %s', (_label, isoDate) => {
      expect(nextWeekStart(isoDate)).toBe(NEXT_MONDAY);
    });
  });

  describe('saveDefaultGoal', () => {
    it('stamps the next Monday and freezes the 20 km fallback as the previous target', () => {
      saveDefaultGoal(35, WEDNESDAY);

      expect(getDefaultGoal()).toEqual({
        km: 35,
        effectiveFromWeek: NEXT_MONDAY,
        previousKm: 20,
      });
    });

    it('freezes the onboarding goal as the previous target when one is stored', () => {
      saveGoal({ km: 30, startDate: '2026-08-03', endDate: null });

      saveDefaultGoal(45, WEDNESDAY);

      expect(getDefaultGoal()).toEqual({
        km: 45,
        effectiveFromWeek: NEXT_MONDAY,
        previousKm: 30,
      });
    });

    it('clamps the saved value into the 0-60 km bounds (A17)', () => {
      saveDefaultGoal(75, WEDNESDAY);
      expect(getDefaultGoal()?.km).toBe(60);

      saveDefaultGoal(-5, WEDNESDAY);
      expect(getDefaultGoal()?.km).toBe(0);
    });

    it('keeps an already-effective default as the running week target on re-save', () => {
      // Saved 35 last week, so this week already runs on 35; saving 40 now
      // must not drop this week back to the onboarding fallback.
      saveDefaultGoal(35, WEDNESDAY);
      saveDefaultGoal(40, '2026-08-12');

      const stored = getDefaultGoal();
      expect(stored).toEqual({ km: 40, effectiveFromWeek: '2026-08-17', previousKm: 35 });
      expect(resolveGoalTarget(null, stored, '2026-08-12')).toBe(35);
      expect(resolveGoalTarget(null, stored, '2026-08-17')).toBe(40);
    });
  });

  describe('resolveGoalTarget', () => {
    it('falls back to the onboarding goal, then 20 km, with no saved default', () => {
      expect(
        resolveGoalTarget({ km: 30, startDate: '2026-08-03', endDate: null }, null, WEDNESDAY),
      ).toBe(30);
      expect(resolveGoalTarget(null, null, WEDNESDAY)).toBe(20);
    });

    it('leaves the current week on its frozen target (AC4)', () => {
      saveDefaultGoal(35, WEDNESDAY);

      expect(resolveGoalTarget(null, getDefaultGoal(), '2026-08-07')).toBe(20);
    });

    it('applies the new default from the next week on (AC3)', () => {
      saveDefaultGoal(35, WEDNESDAY);

      expect(resolveGoalTarget(null, getDefaultGoal(), NEXT_MONDAY)).toBe(35);
      expect(resolveGoalTarget(null, getDefaultGoal(), '2026-08-23')).toBe(35);
    });
  });

  describe('getDefaultGoal', () => {
    it.each([
      ['a stringly km', '{"km":"20","effectiveFromWeek":"2026-08-10","previousKm":20}'],
      ['a malformed week', '{"km":20,"effectiveFromWeek":"next week","previousKm":20}'],
      ['plain junk', '{ not json'],
    ])('reads a stored default with %s as no default', (_label, raw) => {
      window.localStorage.setItem('runlog.defaultGoal', raw);

      expect(getDefaultGoal()).toBeNull();
      expect(resolveGoalTarget(null, getDefaultGoal(), WEDNESDAY)).toBe(20);
    });

    it('clamps out-of-range stored km values instead of dropping them', () => {
      window.localStorage.setItem(
        'runlog.defaultGoal',
        '{"km":75,"effectiveFromWeek":"2026-08-10","previousKm":-3}',
      );

      expect(getDefaultGoal()).toEqual({ km: 60, effectiveFromWeek: NEXT_MONDAY, previousKm: 0 });
    });

    it('snaps a hand-edited mid-week activation date back to its Monday', () => {
      // A Wednesday would otherwise delay activation to the *following* week,
      // since no week's Monday ever compares >= to it until then.
      window.localStorage.setItem(
        'runlog.defaultGoal',
        '{"km":35,"effectiveFromWeek":"2026-08-12","previousKm":20}',
      );

      expect(getDefaultGoal()?.effectiveFromWeek).toBe(NEXT_MONDAY);
    });
  });

  describe('getDefaultGoalKm', () => {
    it('prefers the saved default, then the onboarding goal, then 20 km', () => {
      expect(getDefaultGoalKm()).toBe(20);

      saveGoal({ km: 30, startDate: '2026-08-03', endDate: null });
      expect(getDefaultGoalKm()).toBe(30);

      saveDefaultGoal(45, WEDNESDAY);
      expect(getDefaultGoalKm()).toBe(45);
    });
  });
});
