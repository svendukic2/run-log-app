import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PutGoalDto } from './put-goal.dto';

function validGoal(): Record<string, unknown> {
  return {
    km: 20,
    startDate: '2026-07-14',
    endDate: '2026-09-14',
  };
}

async function errorsFor(overrides: Record<string, unknown>) {
  const dto = plainToInstance(PutGoalDto, { ...validGoal(), ...overrides });
  return validate(dto);
}

describe('PutGoalDto', () => {
  it('accepts the baseline payload', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  describe('km', () => {
    it('accepts both slider ends', async () => {
      expect(await errorsFor({ km: 0 })).toHaveLength(0);
      expect(await errorsFor({ km: 60 })).toHaveLength(0);
    });

    it.each([
      ['below the slider', -1],
      ['above the slider', 61],
      ['a fraction', 20.5],
      ['a numeric string', '20'],
      ['a null', null],
    ])('rejects %s (%s)', async (_label, km) => {
      const errors = await errorsFor({ km });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('km');
    });
  });

  describe('startDate', () => {
    it.each([
      ['Feb 29 of a non-leap year', '2026-02-29'],
      ['a non-zero-padded shape', '2026-1-1'],
      ['a null', null],
    ])('rejects %s (%s)', async (_label, startDate) => {
      const errors = await errorsFor({ startDate });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('startDate');
    });
  });

  describe('endDate', () => {
    it('treats null and omitted both as "No end date"', async () => {
      expect(await errorsFor({ endDate: null })).toHaveLength(0);
      const { endDate, ...withoutEnd } = validGoal();
      void endDate;
      const dto = plainToInstance(PutGoalDto, withoutEnd);
      expect(await validate(dto)).toHaveLength(0);
    });

    it('accepts an end on the same day as the start', async () => {
      expect(
        await errorsFor({ startDate: '2026-07-14', endDate: '2026-07-14' }),
      ).toHaveLength(0);
    });

    it('rejects an end before the start', async () => {
      const errors = await errorsFor({
        startDate: '2026-07-14',
        endDate: '2026-07-13',
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('endDate');
      expect(errors[0].constraints).toHaveProperty('isOnOrAfterStartDate');
    });

    it.each([
      ['an impossible day', '2026-02-31'],
      ['a full timestamp', '2026-09-14T00:00:00Z'],
      ['a number', 20260914],
    ])('rejects %s (%s)', async (_label, endDate) => {
      const errors = await errorsFor({ endDate });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('endDate');
    });

    it('stays quiet about the ordering when startDate itself is invalid', async () => {
      // startDate's own validators report; a comparison against garbage
      // would only add a misleading second error on endDate.
      const errors = await errorsFor({
        startDate: 'garbage',
        endDate: '2026-09-14',
      });
      expect(errors.map((error) => error.property)).toEqual(['startDate']);
    });
  });
});
