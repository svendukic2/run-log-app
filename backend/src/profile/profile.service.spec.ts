import { PrismaService } from '../prisma/prisma.service';
import { WeekTargetsService } from '../week-targets/week-targets.service';
import { ProfileService } from './profile.service';
import type { PutProfileDto } from './dto/put-profile.dto';

// The SET-6 freeze is request-spanning logic the DTO specs cannot see and
// the e2e suite cannot clock-travel for (fake timers would break the
// database driver), so it is proven here against mocks: WHEN the freeze
// fires and for WHICH weeks, including inside the two-Monday window.

function makeMocks(existingDefault: number | null) {
  const row = (defaultWeeklyGoalKm: number) => ({
    id: 'profile-1',
    runningLevel: 'Beginner',
    defaultWeeklyGoalKm,
    userId: 'user-1',
  });
  const prisma = {
    profile: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          existingDefault === null ? null : row(existingDefault),
        ),
      upsert: jest
        .fn()
        .mockImplementation(
          ({ update }: { update: { defaultWeeklyGoalKm: number } }) =>
            Promise.resolve(row(update.defaultWeeklyGoalKm)),
        ),
    },
  };
  const weekTargets = {
    ensure: jest.fn().mockResolvedValue({ weekStart: 'x', targetKm: 1 }),
  };
  const service = new ProfileService(
    prisma as unknown as PrismaService,
    weekTargets as unknown as WeekTargetsService,
  );
  return { prisma, weekTargets, service };
}

function dto(defaultWeeklyGoalKm: number): PutProfileDto {
  return {
    runningLevel: 'Beginner',
    defaultWeeklyGoalKm,
  };
}

describe('ProfileService.put SET-6 freeze', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not freeze anything on the first PUT (onboarding, not a change)', async () => {
    const { weekTargets, service } = makeMocks(null);
    await service.put('user-1', dto(45));
    expect(weekTargets.ensure).not.toHaveBeenCalled();
  });

  it('does not freeze when the default is unchanged', async () => {
    const { weekTargets, service } = makeMocks(45);
    await service.put('user-1', dto(45));
    expect(weekTargets.ensure).not.toHaveBeenCalled();
  });

  it('freezes the single current week before a mid-week default change', async () => {
    // Wednesday 5 Aug 2026, midday UTC: one candidate Monday.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    const { prisma, weekTargets, service } = makeMocks(45);

    await service.put('user-1', dto(50));

    expect(weekTargets.ensure.mock.calls).toEqual([['user-1', '2026-08-03']]);
    // And the write still went through with the new value.
    expect(prisma.profile.upsert).toHaveBeenCalledTimes(1);
  });

  it('freezes BOTH candidate Mondays inside the week-boundary window', async () => {
    // Sunday 9 Aug 2026, 11:00 UTC: UTC+14 is already in the 10 Aug week,
    // the rest of the world still in 3 Aug's. The freeze covers both - the
    // documented bounded exception to "past weeks never materialize".
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T11:00:00.000Z'));
    const { weekTargets, service } = makeMocks(45);

    await service.put('user-1', dto(50));

    expect(weekTargets.ensure.mock.calls.sort()).toEqual([
      ['user-1', '2026-08-03'],
      ['user-1', '2026-08-10'],
    ]);
  });
});
