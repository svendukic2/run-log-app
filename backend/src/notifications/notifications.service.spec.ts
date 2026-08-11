import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

// The bell owner every read-side test acts as.
const USER_ID = 'user-me';

// A stored row as Prisma returns it: payload comes back as parsed JSON,
// timestamps as JS Dates.
function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'notif-1',
    type: 'new-follower',
    payload: { followerId: 'user-ana', firstName: 'Ana', lastName: 'Tester' },
    readAt: null,
    createdAt: new Date('2026-08-11T10:00:00.000Z'),
    userId: USER_ID,
    ...overrides,
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  const prisma: {
    notification: Record<string, jest.Mock>;
    follow: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  } = {
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    follow: {
      findMany: jest.fn(),
    },
    user: {
      findUniqueOrThrow: jest.fn(),
    },
    // list() uses the batch (array) transaction form for snapshot
    // consistency; the mock resolves the already-created promises together.
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  describe('recordNewFollower', () => {
    it('writes one self-contained new-follower notification for the followee (AC1, AC4)', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        firstName: 'Ana',
        lastName: 'Tester',
      });
      prisma.notification.create.mockResolvedValue({});

      // The db handle is the caller's transaction client; the mock stands in.
      await service.recordNewFollower(
        prisma as never,
        'user-followee',
        'user-ana',
      );

      // Name is copied into the payload at write time, never joined later.
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-followee',
          type: 'new-follower',
          payload: {
            followerId: 'user-ana',
            firstName: 'Ana',
            lastName: 'Tester',
          },
        },
      });
    });

    it('writes nothing while an unread new-follower from the same actor is pending (spam bound)', async () => {
      prisma.notification.findFirst.mockResolvedValue({ id: 'notif-1' });

      await service.recordNewFollower(
        prisma as never,
        'user-followee',
        'user-ana',
      );

      // The pending-unread check matches on the payload's followerId, so
      // only THIS actor's unread row suppresses the write.
      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-followee',
          type: 'new-follower',
          readAt: null,
          payload: { path: ['followerId'], equals: 'user-ana' },
        },
        select: { id: true },
      });
      expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('fanOutRunLogged', () => {
    const RUN = {
      id: 'run-9',
      routeName: 'Morning loop',
      distanceKm: 8.2,
      durationSeconds: 2535,
      date: '2026-08-11',
    };

    it('writes one followed-ran row per follower in a single createMany (AC2)', async () => {
      prisma.follow.findMany.mockResolvedValue([
        { followerId: 'user-ana' },
        { followerId: 'user-bruno' },
      ]);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        firstName: 'Runa',
        lastName: 'Tester',
      });
      prisma.notification.createMany.mockResolvedValue({ count: 2 });

      await service.fanOutRunLogged(prisma as never, 'user-runner', RUN);

      // Batched per run: one follower-id query, one insert - no per-follower
      // round trips.
      expect(prisma.follow.findMany).toHaveBeenCalledWith({
        where: { followeeId: 'user-runner' },
        select: { followerId: true },
      });
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
      const payload = {
        runnerId: 'user-runner',
        firstName: 'Runa',
        lastName: 'Tester',
        runId: 'run-9',
        routeName: 'Morning loop',
        distanceKm: 8.2,
        durationSeconds: 2535,
        date: '2026-08-11',
      };
      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-ana', type: 'followed-ran', payload },
          { userId: 'user-bruno', type: 'followed-ran', payload },
        ],
      });
    });

    it('does nothing for a runner with no followers - not even the name lookup', async () => {
      prisma.follow.findMany.mockResolvedValue([]);

      await service.fanOutRunLogged(prisma as never, 'user-runner', RUN);

      expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('chunks a very large fan-out into bounded createMany statements', async () => {
      prisma.follow.findMany.mockResolvedValue(
        Array.from({ length: 2345 }, (_, i) => ({ followerId: `user-${i}` })),
      );
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        firstName: 'Runa',
        lastName: 'Tester',
      });
      prisma.notification.createMany.mockResolvedValue({ count: 1000 });

      await service.fanOutRunLogged(prisma as never, 'user-runner', RUN);

      // 2345 followers at 1000 per statement = 3 inserts covering everyone.
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(3);
      const sizes = prisma.notification.createMany.mock.calls.map(
        ([arg]: [{ data: unknown[] }]) => arg.data.length,
      );
      expect(sizes).toEqual([1000, 1000, 345]);
    });
  });

  describe('list', () => {
    it('pages newest-first and carries total and unread count (AC3)', async () => {
      const read = row({
        id: 'notif-2',
        readAt: new Date('2026-08-11T11:00:00.000Z'),
      });
      prisma.notification.findMany.mockResolvedValue([row(), read]);
      prisma.notification.count
        .mockResolvedValueOnce(12) // total
        .mockResolvedValueOnce(5); // unread

      const result = await service.list(USER_ID, { page: 2, pageSize: 2 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 2,
        take: 2,
      });
      // The unread count is its own filtered count, not derived from the page.
      expect(prisma.notification.count).toHaveBeenNthCalledWith(2, {
        where: { userId: USER_ID, readAt: null },
      });
      expect(result).toEqual({
        items: [
          {
            id: 'notif-1',
            type: 'new-follower',
            payload: {
              followerId: 'user-ana',
              firstName: 'Ana',
              lastName: 'Tester',
            },
            readAt: null,
            createdAt: '2026-08-11T10:00:00.000Z',
          },
          {
            id: 'notif-2',
            type: 'new-follower',
            payload: {
              followerId: 'user-ana',
              firstName: 'Ana',
              lastName: 'Tester',
            },
            readAt: '2026-08-11T11:00:00.000Z',
            createdAt: '2026-08-11T10:00:00.000Z',
          },
        ],
        total: 12,
        page: 2,
        pageSize: 2,
        unreadCount: 5,
      });
    });

    it('applies the pagination defaults on an empty query', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.list(USER_ID, {});

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });
  });

  describe('markRead', () => {
    it('sets readAt only when unread and answers the row (AC3)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      const readRow = row({ readAt: new Date('2026-08-11T12:00:00.000Z') });
      prisma.notification.findFirst.mockResolvedValue(readRow);

      const result = await service.markRead(USER_ID, 'notif-1');

      // The readAt-null filter is the idempotency: a second call matches
      // nothing and the original timestamp survives.
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: USER_ID, readAt: null },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any is typed any
        data: { readAt: expect.any(Date) },
      });
      expect(result.readAt).toBe('2026-08-11T12:00:00.000Z');
    });

    it('404s a notification that is missing or someone elses alike', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead(USER_ID, 'not-mine')).rejects.toThrow(
        NotFoundException,
      );
      // The read-back was scoped to the owner, like every lookup in the app.
      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'not-mine', userId: USER_ID },
      });
    });
  });

  describe('markAllRead', () => {
    it('flips every unread row in one statement and reports how many (AC3)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 7 });

      await expect(service.markAllRead(USER_ID)).resolves.toEqual({
        updated: 7,
      });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, readAt: null },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any is typed any
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
