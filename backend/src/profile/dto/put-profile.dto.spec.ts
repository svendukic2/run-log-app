import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PutProfileDto } from './put-profile.dto';

// Direct class-validator runs against the DTO, the same approach as the
// runs DTO spec: plainToInstance applies the @Transform trims, matching
// the app-wide ValidationPipe (transform: true).
//
// Since RUN-59 the profile carries the SETUP ANSWERS only - the name and
// email validators moved with their fields to PutAccountDto.

function validProfile(): Record<string, unknown> {
  return {
    runningLevel: 'Intermediate',
    defaultWeeklyGoalKm: 25,
  };
}

async function errorsFor(overrides: Record<string, unknown>) {
  const dto = plainToInstance(PutProfileDto, {
    ...validProfile(),
    ...overrides,
  });
  return validate(dto);
}

describe('PutProfileDto', () => {
  it('accepts the baseline payload', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('requires every field: PUT is a full replace', async () => {
    const dto = plainToInstance(PutProfileDto, {});
    const errors = await validate(dto);
    expect(errors.map((error) => error.property).sort()).toEqual([
      'defaultWeeklyGoalKm',
      'runningLevel',
    ]);
  });

  describe('runningLevel', () => {
    it.each([
      ['a lowercase v1 spelling', 'intermediate'],
      ['an unknown level', 'Elite'],
      ['a null', null],
    ])('rejects %s (%s)', async (_label, runningLevel) => {
      const errors = await errorsFor({ runningLevel });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('runningLevel');
    });
  });

  describe('defaultWeeklyGoalKm', () => {
    it('accepts both slider ends', async () => {
      expect(await errorsFor({ defaultWeeklyGoalKm: 0 })).toHaveLength(0);
      expect(await errorsFor({ defaultWeeklyGoalKm: 60 })).toHaveLength(0);
    });

    it.each([
      ['below the slider', -1],
      ['above the slider', 61],
      ['a fraction', 22.5],
      ['a numeric string', '25'],
      ['a null', null],
    ])('rejects %s (%s)', async (_label, defaultWeeklyGoalKm) => {
      const errors = await errorsFor({ defaultWeeklyGoalKm });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('defaultWeeklyGoalKm');
    });
  });
});
