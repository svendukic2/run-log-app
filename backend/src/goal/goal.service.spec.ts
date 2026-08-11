import { PrismaService } from '../prisma/prisma.service';
import { WeekTargetsService } from '../week-targets/week-targets.service';
import { GoalService } from './goal.service';

// The goal-side SET-6 freeze: goal.km is the week-target seed ONLY while
// the account has no profile row (snapshotKm prefers the profile default),
// so the freeze must fire exactly in that state and no other. Mock-based
// for the same reason as profile.service.spec.ts: the e2e suite cannot
// clock-travel.

function makeMocks(options: {
  existingKm: number | null;
  hasProfile: boolean;
}) {
  const goalRow = (km: number) => ({
    id: 'goal-1',
    km,
    startDate: new Date('2026-07-14T00:00:00.000Z'),
    endDate: null,
    userId: 'user-1',
  });
  const prisma = {
    goal: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.existingKm === null ? null : goalRow(options.existingKm),
        ),
      upsert: jest
        .fn()
        .mockImplementation(({ update }: { update: { km: number } }) =>
          Promise.resolve(goalRow(update.km)),
        ),
    },
    profile: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.hasProfile ? { id: 'profile-1' } : null),
    },
  };
  const weekTargets = {
    ensure: jest.fn().mockResolvedValue({ weekStart: 'x', targetKm: 1 }),
  };
  const service = new GoalService(
    prisma as unknown as PrismaService,
    weekTargets as unknown as WeekTargetsService,
  );
  return { prisma, weekTargets, service };
}

const dto = (km: number) => ({ km, startDate: '2026-07-14', endDate: null });

describe('GoalService.put SET-6 freeze', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not freeze on the first PUT (onboarding, nothing is changing)', async () => {
    const { weekTargets, service } = makeMocks({
      existingKm: null,
      hasProfile: false,
    });
    await service.put('user-1', dto(30));
    expect(weekTargets.ensure).not.toHaveBeenCalled();
  });

  it('does not freeze when km is unchanged', async () => {
    const { weekTargets, service } = makeMocks({
      existingKm: 30,
      hasProfile: false,
    });
    await service.put('user-1', dto(30));
    expect(weekTargets.ensure).not.toHaveBeenCalled();
  });

  it('does not freeze when a profile exists: the goal is not the seed then', async () => {
    const { weekTargets, service } = makeMocks({
      existingKm: 30,
      hasProfile: true,
    });
    await service.put('user-1', dto(55));
    expect(weekTargets.ensure).not.toHaveBeenCalled();
  });

  it('freezes the current week before a km change while the goal IS the seed', async () => {
    // Wednesday 5 Aug 2026, midday UTC: one candidate Monday.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    const { prisma, weekTargets, service } = makeMocks({
      existingKm: 30,
      hasProfile: false,
    });

    await service.put('user-1', dto(55));

    expect(weekTargets.ensure.mock.calls).toEqual([['user-1', '2026-08-03']]);
    expect(prisma.goal.upsert).toHaveBeenCalledTimes(1);
  });
});
