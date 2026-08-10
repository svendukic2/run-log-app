import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateRunDto,
  NOTE_MAX_LENGTH,
  ROUTE_NAME_MAX_LENGTH,
} from './create-run.dto';
import { UpdateRunDto } from './update-run.dto';

// Direct class-validator runs against the DTOs: the trickiest logic in the
// module is the date validator, and it needs no HTTP server to be proven.
// plainToInstance applies the @Transform trim, matching what the
// ValidationPipe (transform: true) does in production.

function validRun(): Record<string, unknown> {
  return {
    routeName: 'Morning loop',
    distanceKm: 8.2,
    durationSeconds: 2535,
    date: '2026-07-14',
    effort: 'Medium',
    note: '',
  };
}

async function createErrors(overrides: Record<string, unknown>) {
  const dto = plainToInstance(CreateRunDto, { ...validRun(), ...overrides });
  return validate(dto);
}

async function updateErrors(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateRunDto, payload);
  return validate(dto);
}

describe('CreateRunDto', () => {
  // Pin "now" so the today/tomorrow boundary is deterministic instead of
  // depending on the day CI happens to run: Wed 5 Aug 2026, 12:00 UTC.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts the baseline payload', async () => {
    expect(await createErrors({})).toHaveLength(0);
  });

  describe('date', () => {
    it.each([
      ['a real past leap day', '2024-02-29', true],
      ['Feb 29 of a non-leap year', '2026-02-29', false],
      ['Feb 31, which Date silently rolls over', '2026-02-31', false],
      ['today (UTC)', '2026-08-05', true],
      // One day of slack: a client west or east of the server can
      // legitimately be on "tomorrow" (see latestAcceptableIso).
      ['tomorrow (UTC)', '2026-08-06', true],
      ['the day after tomorrow', '2026-08-07', false],
      ['a non-zero-padded shape', '2026-1-1', false],
      ['a null', null, false],
      ['a number', 20260714, false],
    ])('%s (%s) -> valid: %s', async (_label, date, valid) => {
      const errors = await createErrors({ date });
      expect(errors.length === 0).toBe(valid);
    });

    // Midday UTC is the one time of day where local and UTC getters agree
    // everywhere, so it cannot catch a local-getter bug. These two pins
    // straddle the UTC midnight boundary: on any machine whose local zone
    // is not UTC (this repo's dev machines included), an implementation
    // accidentally built from local getters computes a different boundary
    // here and fails.
    it('holds the boundary just before UTC midnight', async () => {
      jest.setSystemTime(new Date('2026-08-05T23:59:00.000Z'));
      expect(await createErrors({ date: '2026-08-06' })).toHaveLength(0);
      expect(await createErrors({ date: '2026-08-07' })).toHaveLength(1);
    });

    it('advances the boundary just after UTC midnight', async () => {
      jest.setSystemTime(new Date('2026-08-06T00:01:00.000Z'));
      expect(await createErrors({ date: '2026-08-07' })).toHaveLength(0);
      expect(await createErrors({ date: '2026-08-08' })).toHaveLength(1);
    });
  });

  describe('routeName', () => {
    it('rejects whitespace-only names (trimmed before IsNotEmpty)', async () => {
      const errors = await createErrors({ routeName: '   ' });
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isNotEmpty');
    });

    it('trims surrounding whitespace off the stored value', async () => {
      const dto = plainToInstance(CreateRunDto, {
        ...validRun(),
        routeName: '  Morning loop  ',
      });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.routeName).toBe('Morning loop');
    });

    it('rejects names over the documented bound', async () => {
      const errors = await createErrors({
        routeName: 'x'.repeat(ROUTE_NAME_MAX_LENGTH + 1),
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('maxLength');
    });
  });

  describe('optional fields', () => {
    it('accepts an omitted effort and note', async () => {
      const { effort, note, ...rest } = validRun();
      void effort;
      void note;
      const dto = plainToInstance(CreateRunDto, rest);
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects an explicit null effort instead of treating it as Medium', async () => {
      const errors = await createErrors({ effort: null });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('effort');
    });

    it('rejects an explicit null note', async () => {
      const errors = await createErrors({ note: null });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('note');
    });

    it('rejects a note over the documented bound', async () => {
      const errors = await createErrors({
        note: 'x'.repeat(NOTE_MAX_LENGTH + 1),
      });
      expect(errors).toHaveLength(1);
    });
  });
});

describe('UpdateRunDto', () => {
  it('accepts an empty payload and a single valid field', async () => {
    expect(await updateErrors({})).toHaveLength(0);
    expect(await updateErrors({ distanceKm: 9.5 })).toHaveLength(0);
  });

  // The reason skipNullProperties: false exists: @IsOptional would skip
  // validation for null entirely and hand Prisma a null for a NOT NULL
  // column (a 500); these must all be 400s.
  it.each([
    'routeName',
    'distanceKm',
    'durationSeconds',
    'date',
    'effort',
    'note',
  ])('rejects an explicit null %s', async (field) => {
    const errors = await updateErrors({ [field]: null });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe(field);
  });
});
