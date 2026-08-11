import { Test } from '@nestjs/testing';
import { toDbDate } from '../common/dates';
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

function aggregate(userId: string, km: number, runs: number) {
  return { userId, _sum: { distanceKm: km }, _count: { _all: runs } };
}

describe('LeaderboardService (RUN-70)', () => {
  let service: LeaderboardService;
  const prisma = {
    user: { findMany: jest.fn() },
    run: { groupBy: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
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

    // AC6: one GROUP BY, bounded by the candidates and the inclusive week
    // (the e2e suite proves the boundary days against a real database).
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { showOnLeaderboard: true } }),
    );
    expect(prisma.run.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['userId'],
        where: {
          userId: { in: [USER_ID, 'user-ana', 'user-bo'] },
          date: { gte: toDbDate(MONDAY), lte: toDbDate(SUNDAY) },
        },
      }),
    );
  });

  it('leaves an opted-out caller off the board entirely (AC3)', async () => {
    // The caller is not among the opted-in users the query returns, which
    // is the only thing "opted out" means here: no row, no rank, and their
    // runs are never aggregated in the first place.
    prisma.user.findMany.mockResolvedValue([candidate('user-ana')]);
    prisma.run.groupBy.mockResolvedValue([aggregate('user-ana', 8, 1)]);

    const board = await service.weeklyBoard(USER_ID, { weekStart: WEDNESDAY });

    expect(board.me).toBeNull();
    expect(board.items.map((row) => row.id)).toEqual(['user-ana']);
    expect(prisma.run.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: { in: ['user-ana'] },
          date: { gte: toDbDate(MONDAY), lte: toDbDate(SUNDAY) },
        },
      }),
    );
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
