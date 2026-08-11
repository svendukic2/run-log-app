import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NAME_MAX_LENGTH, PutProfileDto } from './put-profile.dto';

// Direct class-validator runs against the DTO, the same approach as the
// runs DTO spec: plainToInstance applies the @Transform trims, matching
// the app-wide ValidationPipe (transform: true).

function validProfile(): Record<string, unknown> {
  return {
    firstName: 'Ana',
    lastName: 'Anić',
    email: 'ana@example.com',
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
      'email',
      'firstName',
      'lastName',
      'runningLevel',
    ]);
  });

  describe('names', () => {
    it('rejects whitespace-only names (trimmed before IsNotEmpty)', async () => {
      expect(await errorsFor({ firstName: '   ' })).toHaveLength(1);
      expect(await errorsFor({ lastName: '   ' })).toHaveLength(1);
    });

    it('trims surrounding whitespace off the stored values', async () => {
      const dto = plainToInstance(PutProfileDto, {
        ...validProfile(),
        firstName: '  Ana  ',
      });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.firstName).toBe('Ana');
    });

    it('rejects names over the documented bound', async () => {
      const errors = await errorsFor({
        firstName: 'x'.repeat(NAME_MAX_LENGTH + 1),
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('maxLength');
    });
  });

  describe('email', () => {
    it.each([
      ['a missing @', 'ana.example.com'],
      ['a missing domain', 'ana@'],
      ['an empty string', ''],
      ['a number', 42],
      ['a null', null],
    ])('rejects %s (%s)', async (_label, email) => {
      const errors = await errorsFor({ email });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('email');
    });
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
