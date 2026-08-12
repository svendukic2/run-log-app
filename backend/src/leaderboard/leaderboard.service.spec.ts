import { Test } from '@nestjs/testing';
import { toDbDate } from '../common/dates';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LEADERBOARD_LIMIT, LeaderboardService } from './leaderboard.service';

// A Wednesday and the Monday-Sunday week it falls in: the request may name
// any day, the window is always its week (AC4).
const WEDNESDAY = '2026-08-12';
const MONDAY = '2026-08-10';
const SUNDAY = '2026-08-16';

const USER_ID = 'user-me';

function candidate(id: string) {
  return { id, firstName: id, lastName: 'Tester' };
}

// A groupBy result as Prisma actually returns it: _sum over a NUMERIC column
// is a Decimal, not a number (RUN-78). Building it that way is what makes the
// kmNumber call in the service load-bearing - with a plain number here, the
// whole conversion could be deleted and this suite would stay green while
// every totalKm on the board turned into an object.
function aggregate(userId: string, km: number, runs: number) {
  return {
    userId,
    _sum: { distanceKm: new Prisma.Decimal(km) },
    _count: { _all: runs },
  };
}

describe('LeaderboardService (RUN-70)', () => {
  let service: LeaderboardService;
  const prisma = {
    user: { findMany: jest.fn() },
    run: { groupBy: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // The outlier read (RUN-72) runs on every board; the test that cares
    // about it overrides this.
    prisma.run.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeaderboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(LeaderboardService);
  });

  it('ranks the week by total km, ties sharing a place, over the Monday-Sunday window (AC1, AC4)', async () => {
    prisma.user.findMany.mockResolvedValue([
      candidate(USER_ID),
      candidate('user-ana'),
      candidate('user-bo'),
    ]);
    prisma.run.groupBy.mockResolvedValue([
      aggregate(USER_ID, 12.5, 2),
      aggregate('user-ana', 42, 4),
      aggregate('user-bo', 42, 5),
    ]);

    const board = await service.weeklyBoard(USER_ID, { weekStart: WEDNESDAY });

    expect([board.weekStart, board.weekEnd]).toEqual([MONDAY, SUNDAY]);
    // Tied at 42 km, so they share first place and the next distinct
    // distance takes third.
    expect(board.items.map((row) => [row.id, row.rank, row.totalKm])).toEqual([
      ['user-ana', 1, 42],
      ['user-bo', 1, 42],
      [USER_ID, 3, 12.5],
    ]);
    expect(board.items[2]).toMatchObject({ me: true, runCount: 2 });
    expect(board.total).toBe(3);
    expect(board.me).toEqual(board.items[2]);

    // AC6: one GROUP BY, gated on the opt-in inside the query itself and
    // bounded by the inclusive week. Both boundary days are named here
    // because they are the whole contract of "this week".
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { showOnLeaderboard: true } }),
    );
    expect(prisma.run.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['userId'],
        where: {
          user: { showOnLeaderboard: true },
          date: { gte: toDbDate(MONDAY), lte: toDbDate(SUNDAY) },
        },
      }),
    );
  });

  it('leaves an opted-out caller off the board entirely (AC3)', async () => {
    // The caller is not among the opted-in users the query returns, which
    // is the only thing "opted out" means here: no row and no rank. The
    // aggregation carries the same gate, so their distances are never
    // summed either.
    prisma.user.findMany.mockResolvedValue([candidate('user-ana')]);
    prisma.run.groupBy.mockResolvedValue([aggregate('user-ana', 8, 1)]);

    const board = await service.weeklyBoard(USER_ID, { weekStart: WEDNESDAY });

    expect(board.me).toBeNull();
    expect(board.items.map((row) => row.id)).toEqual(['user-ana']);
  });

  it('gives every runner a shared place at zero km in a week with no runs', async () => {
    prisma.user.findMany.mockResolvedValue([
      candidate(USER_ID),
      candidate('user-ana'),
    ]);
    prisma.run.groupBy.mockResolvedValue([]);

    const board = await service.weeklyBoard(USER_ID, { weekStart: WEDNESDAY });

    // Everyone ties at 0 km, so they all share first place and the id
    // decides only the drawing order.
    expect(board.items).toEqual([
      expect.objectContaining({ id: 'user-ana', rank: 1, totalKm: 0 }),
      expect.objectContaining({
        id: USER_ID,
        rank: 1,
        totalKm: 0,
        runCount: 0,
      }),
    ]);
  });

  it('answers an empty board without aggregating when nobody opted in', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    const board = await service.weeklyBoard(USER_ID, {});

    expect(board).toMatchObject({ items: [], me: null, total: 0 });
    expect(prisma.run.groupBy).not.toHaveBeenCalled();
  });

  // RUN-72 AC2: the marker is a fact about ONE run, so a week whose total
  // is ordinary still carries it when a single run inside it was extreme,
  // and a runner whose runs were all ordinary does not.
  it('marks the row of a runner with a legal but extreme run (RUN-72 AC2)', async () => {
    prisma.user.findMany.mockResolvedValue([
      candidate(USER_ID),
      candidate('user-ana'),
    ]);
    prisma.run.groupBy.mockResolvedValue([
      aggregate(USER_ID, 20, 2),
      aggregate('user-ana', 20, 2),
    ]);
    // Decimals, like the column returns (RUN-78). The outlier rules are plain
    // arithmetic, so a Decimal that reached them would compare false against
    // every threshold and the marker would quietly stop appearing.
    prisma.run.findMany.mockResolvedValue([
      {
        userId: USER_ID,
        distanceKm: new Prisma.Decimal(10),
        durationSeconds: 3_000,
      },
      {
        userId: USER_ID,
        distanceKm: new Prisma.Decimal(10),
        durationSeconds: 3_100,
      },
      // 10 km at 3:20 /km: inside the hard limits, past the soft one.
      {
        userId: 'user-ana',
        distanceKm: new Prisma.Decimal(10),
        durationSeconds: 2_000,
      },
      {
        userId: 'user-ana',
        distanceKm: new Prisma.Decimal(10),
        durationSeconds: 3_000,
      },
    ]);

    const board = await service.weeklyBoard(USER_ID, { weekStart: WEDNESDAY });

    expect(board.items.map((row) => [row.id, row.unverified])).toEqual(
      expect.arrayContaining([
        [USER_ID, false],
        ['user-ana', true],
      ]),
    );
    // Read through the same opt-in gate as the aggregation, so an
    // opted-out runner's runs are never even fetched.
    // Bounded to the rows this response carries and gated on the opt-in,
    // so an opted-out runner's runs are never fetched.
    expect(prisma.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: { in: ['user-ana', USER_ID] },
          user: { showOnLeaderboard: true },
          date: { gte: toDbDate(MONDAY), lte: toDbDate(SUNDAY) },
        },
      }),
    );
  });

  it('serves the top rows and still answers the caller far below them (AC2)', async () => {
    const others = Array.from({ length: LEADERBOARD_LIMIT }, (_, index) =>
      candidate(`user-${String(index).padStart(3, '0')}`),
    );
    prisma.user.findMany.mockResolvedValue([...others, candidate(USER_ID)]);
    prisma.run.groupBy.mockResolvedValue([
      ...others.map((row) => aggregate(row.id, 100, 10)),
      aggregate(USER_ID, 3, 1),
    ]);

    const board = await service.weeklyBoard(USER_ID, { weekStart: WEDNESDAY });

    expect(board.items).toHaveLength(LEADERBOARD_LIMIT);
    expect(board.items.some((row) => row.me)).toBe(false);
    // The rank is the caller's place among EVERYONE, not among the rows
    // they were sent: the whole point of the pinned row.
    expect(board.me).toMatchObject({
      id: USER_ID,
      rank: LEADERBOARD_LIMIT + 1,
      totalKm: 3,
    });
    expect(board.total).toBe(LEADERBOARD_LIMIT + 1);
  });
});
