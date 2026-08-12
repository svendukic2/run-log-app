import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { addDaysIso, toDbDate, utcTodayIso } from '../common/dates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { deriveEventState, EventsService } from './events.service';

// Freeze "today" for the whole suite: the fixture days below are computed
// once at module load, but the service calls utcTodayIso() per request, so
// a suite run straddling UTC midnight would otherwise compare day N
// fixtures against day N+1 queries and flake exactly once a day.
jest.mock('../common/dates', () => {
  const actual =
    jest.requireActual<typeof import('../common/dates')>('../common/dates');
  const frozenToday = actual.utcTodayIso();
  return { ...actual, utcTodayIso: (): string => frozenToday };
});

const USER_ID = 'user-me';
const OWNER_ID = 'user-owner';

// The suite computes its calendar days from the (frozen) real today: state
// derivation is relative to it, so fixed literals would start failing the
// day after they were written.
const TODAY = utcTodayIso();
const YESTERDAY = addDaysIso(TODAY, -1);
const TOMORROW = addDaysIso(TODAY, 1);

// A Prisma error as the duck-typed predicate sees it.
function prismaError(code: string, constraint?: string) {
  return Object.assign(new Error(code), {
    code,
    ...(constraint && { meta: { constraint } }),
  });
}

// A stored event row with the read include (owner, count, caller's own
// participant rows), as the queries in the service return it.
function eventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'event-1',
    name: 'Summer 100k',
    description: 'Run 100 km together',
    startDate: toDbDate(TODAY),
    endDate: toDbDate(TOMORROW),
    targetKm: 100,
    createdAt: new Date('2026-08-11T10:00:00.000Z'),
    ownerId: OWNER_ID,
    owner: { id: OWNER_ID, firstName: 'Ana', lastName: 'Tester' },
    _count: { participants: 3 },
    participants: [] as Array<{ id: string }>,
    ...overrides,
  };
}

describe('deriveEventState', () => {
  it('partitions the timeline with inclusive start and end days (AC3)', () => {
    expect(deriveEventState('2026-08-12', '2026-08-14', '2026-08-11')).toBe(
      'upcoming',
    );
    // Active on the start and end days themselves.
    expect(deriveEventState('2026-08-12', '2026-08-14', '2026-08-12')).toBe(
      'active',
    );
    expect(deriveEventState('2026-08-12', '2026-08-14', '2026-08-14')).toBe(
      'active',
    );
    expect(deriveEventState('2026-08-12', '2026-08-14', '2026-08-15')).toBe(
      'finished',
    );
    // A one-day event is active exactly on its day.
    expect(deriveEventState('2026-08-12', '2026-08-12', '2026-08-12')).toBe(
      'active',
    );
  });
});

// rankByDistance moved to common/ranking.ts in RUN-70 (the global weekly
// board is its second caller) and is covered by common/ranking.spec.ts.

describe('EventsService', () => {
  let service: EventsService;
  const prisma: {
    event: Record<string, jest.Mock>;
    eventParticipant: Record<string, jest.Mock>;
    run: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  } = {
    event: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    eventParticipant: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    run: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const notifications = {
    recordEventJoined: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // The outlier read (RUN-72) runs on every participant list; the tests
    // that care about it override this.
    prisma.run.findMany.mockResolvedValue([]);
    // join() uses the interactive (callback) form, list() the batch (array)
    // form; the mock serves both.
    prisma.$transaction.mockImplementation(
      (arg: ((tx: unknown) => Promise<unknown>) | Promise<unknown>[]) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = moduleRef.get(EventsService);
  });

  describe('create', () => {
    const DTO = {
      name: 'Summer 100k',
      startDate: TODAY,
      endDate: TOMORROW,
    };

    it('creates the event with the caller as owner and first participant in one statement (AC1)', async () => {
      prisma.event.create.mockResolvedValue(
        eventRow({
          ownerId: USER_ID,
          owner: { id: USER_ID, firstName: 'Me', lastName: 'Tester' },
          description: '',
          targetKm: null,
          _count: { participants: 1 },
          participants: [{ id: 'part-1' }],
        }),
      );

      const result = await service.create(USER_ID, DTO);

      expect(prisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Summer 100k',
            description: '',
            startDate: toDbDate(TODAY),
            endDate: toDbDate(TOMORROW),
            targetKm: null,
            ownerId: USER_ID,
            participants: { create: { userId: USER_ID } },
          },
        }),
      );
      expect(result.state).toBe('active');
      expect(result.joined).toBe(true);
      expect(result.mine).toBe(true);
      expect(result.participantCount).toBe(1);
    });

    it('rejects an end date before the start date (AC1)', async () => {
      await expect(
        service.create(USER_ID, { ...DTO, endDate: YESTERDAY }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('answers a dead session with 401 when the FK insert fails', async () => {
      prisma.event.create.mockRejectedValue(
        prismaError('P2003', 'Event_ownerId_fkey'),
      );

      await expect(service.create(USER_ID, DTO)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('list', () => {
    it('pages chronologically with counts and derived state (AC3)', async () => {
      prisma.event.findMany.mockResolvedValue([
        eventRow({ participants: [{ id: 'part-1' }] }),
      ]);
      prisma.event.count.mockResolvedValue(9);

      const result = await service.list(USER_ID, { page: 2, pageSize: 4 });

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
          skip: 4,
          take: 4,
        }),
      );
      expect(result).toEqual({
        items: [
          {
            id: 'event-1',
            name: 'Summer 100k',
            description: 'Run 100 km together',
            startDate: TODAY,
            endDate: TOMORROW,
            targetKm: 100,
            state: 'active',
            participantCount: 3,
            joined: true,
            mine: false,
            owner: { id: OWNER_ID, firstName: 'Ana', lastName: 'Tester' },
            createdAt: '2026-08-11T10:00:00.000Z',
          },
        ],
        total: 9,
        page: 2,
        pageSize: 4,
      });
    });

    it.each([
      ['upcoming', { startDate: { gt: toDbDate(TODAY) } }],
      [
        'active',
        {
          startDate: { lte: toDbDate(TODAY) },
          endDate: { gte: toDbDate(TODAY) },
        },
      ],
      ['finished', { endDate: { lt: toDbDate(TODAY) } }],
    ] as const)(
      'translates the %s filter into its date range (AC3)',
      async (state, where) => {
        prisma.event.findMany.mockResolvedValue([]);
        prisma.event.count.mockResolvedValue(0);

        await service.list(USER_ID, { state });

        expect(prisma.event.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where }),
        );
        expect(prisma.event.count).toHaveBeenCalledWith({ where });
      },
    );
  });

  describe('findOne', () => {
    it('answers any existing event to any signed-in user', async () => {
      prisma.event.findUnique.mockResolvedValue(eventRow());

      const result = await service.findOne(USER_ID, 'event-1');

      expect(result.joined).toBe(false);
      expect(result.mine).toBe(false);
      expect(result.owner.id).toBe(OWNER_ID);
    });

    it('404s an unknown id', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.findOne(USER_ID, 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listParticipants (RUN-69)', () => {
    // Three runners: two opted in (one of them the caller), one opted out.
    function participant(id: string, showOnLeaderboard: boolean, day = 1) {
      return {
        createdAt: new Date(`2026-08-0${day}T09:00:00.000Z`),
        user: { id, firstName: id, lastName: 'Tester', showOnLeaderboard },
      };
    }

    function aggregate(userId: string, km: number, runs: number) {
      return { userId, _sum: { distanceKm: km }, _count: { _all: runs } };
    }

    it('ranks the opted-in participants and withholds the opted-out runner’s numbers (AC2, AC3)', async () => {
      prisma.event.findUnique.mockResolvedValue({
        startDate: toDbDate(YESTERDAY),
        endDate: toDbDate(TOMORROW),
      });
      prisma.eventParticipant.findMany.mockResolvedValue([
        participant(USER_ID, true, 1),
        participant('user-hidden', false, 2),
        participant('user-ana', true, 3),
      ]);
      prisma.run.groupBy.mockResolvedValue([
        aggregate(USER_ID, 12.5, 2),
        // The hidden runner leads on distance and still must not rank,
        // which is also what proves the ranks are not simply array order.
        aggregate('user-hidden', 40, 5),
        aggregate('user-ana', 20.25, 3),
      ]);
      // RUN-72: one of Ana's runs is legal but extreme (10 km at 3:20 /km),
      // the caller's is ordinary. The hidden runner's runs are not here
      // because they are never read.
      prisma.run.findMany.mockResolvedValue([
        { userId: USER_ID, distanceKm: 10, durationSeconds: 3_000 },
        { userId: 'user-ana', distanceKm: 10, durationSeconds: 2_000 },
      ]);

      const { items, total } = await service.listParticipants(
        USER_ID,
        'event-1',
      );

      expect(total).toBe(3);
      // Join order is the list order (AC1); the ranks are global.
      expect(items.map((row) => [row.id, row.rank])).toEqual([
        [USER_ID, 2],
        ['user-hidden', null],
        ['user-ana', 1],
      ]);
      expect(items[0]).toMatchObject({
        me: true,
        totalKm: 12.5,
        runCount: 2,
        unverified: false,
      });
      // Opted out: no place and no numbers at all, the marker included.
      expect(items[1]).toMatchObject({
        me: false,
        totalKm: null,
        runCount: null,
        unverified: null,
      });
      // RUN-72 AC2: the extreme run reaches the row as the marker, and the
      // runs it is derived from are read only for runners on the board.
      expect(items[2]).toMatchObject({ rank: 1, unverified: true });
      expect(prisma.run.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: { in: [USER_ID, 'user-ana'] },
            date: { gte: toDbDate(YESTERDAY), lte: toDbDate(TOMORROW) },
          },
        }),
      );

      // The aggregation is one GROUP BY over these participants, bounded by
      // the event's own inclusive window (AC6's contract; the e2e suite
      // proves the boundary days against a real database).
      expect(prisma.run.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['userId'],
          where: {
            userId: { in: [USER_ID, 'user-hidden', 'user-ana'] },
            date: { gte: toDbDate(YESTERDAY), lte: toDbDate(TOMORROW) },
          },
        }),
      );
    });

    it('gives a participant with no runs in the window a place with zero km', async () => {
      prisma.event.findUnique.mockResolvedValue({
        startDate: toDbDate(TODAY),
        endDate: toDbDate(TOMORROW),
      });
      prisma.eventParticipant.findMany.mockResolvedValue([
        participant(USER_ID, true),
      ]);
      prisma.run.groupBy.mockResolvedValue([]);

      const { items } = await service.listParticipants(USER_ID, 'event-1');

      expect(items[0]).toMatchObject({ rank: 1, totalKm: 0, runCount: 0 });
    });

    it('404s an unknown event without touching the aggregation', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.listParticipants(USER_ID, 'nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.run.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('join', () => {
    // The membership read inside the transaction (select ownerId/name) and
    // the answering findOne (full include) share the findUnique mock, so
    // the happy paths chain a lean row, then the full one.
    function mockJoinReads(ownerId: string) {
      prisma.event.findUnique
        .mockResolvedValueOnce({ ownerId, name: 'Summer 100k' })
        .mockResolvedValue(
          eventRow({ ownerId, participants: [{ id: 'part-1' }] }),
        );
    }

    it('creates the participant, notifies the owner and answers the updated event (AC2, AC4)', async () => {
      mockJoinReads(OWNER_ID);
      prisma.eventParticipant.create.mockResolvedValue({});

      await expect(service.join(USER_ID, 'event-1')).resolves.toMatchObject({
        id: 'event-1',
        joined: true,
        mine: false,
        participantCount: 3,
      });

      expect(prisma.eventParticipant.create).toHaveBeenCalledWith({
        data: { eventId: 'event-1', userId: USER_ID },
      });
      expect(notifications.recordEventJoined).toHaveBeenCalledWith(
        prisma,
        OWNER_ID,
        USER_ID,
        { id: 'event-1', name: 'Summer 100k' },
      );
    });

    it('treats a repeat join as an idempotent no-op that never re-notifies (AC2)', async () => {
      mockJoinReads(OWNER_ID);
      prisma.eventParticipant.create.mockRejectedValue(prismaError('P2002'));

      await expect(service.join(USER_ID, 'event-1')).resolves.toMatchObject({
        joined: true,
      });
      // The unique violation aborts the transaction before the notification
      // write, so the mock was never reached with a second row.
      expect(notifications.recordEventJoined).not.toHaveBeenCalled();
    });

    it('does not notify the owner about their own join (their P2002 aside, ownership short-circuits)', async () => {
      mockJoinReads(USER_ID);
      prisma.eventParticipant.create.mockResolvedValue({});

      await service.join(USER_ID, 'event-1');

      expect(notifications.recordEventJoined).not.toHaveBeenCalled();
    });

    it('404s a join of an unknown event', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.join(USER_ID, 'nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.eventParticipant.create).not.toHaveBeenCalled();
    });

    it('maps the userId FK break to 401 and the eventId FK break to 404 by constraint name', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ownerId: OWNER_ID,
        name: 'Summer 100k',
      });

      prisma.eventParticipant.create.mockRejectedValue(
        prismaError('P2003', 'EventParticipant_userId_fkey'),
      );
      await expect(service.join(USER_ID, 'event-1')).rejects.toThrow(
        UnauthorizedException,
      );

      prisma.eventParticipant.create.mockRejectedValue(
        prismaError('P2003', 'EventParticipant_eventId_fkey'),
      );
      await expect(service.join(USER_ID, 'event-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('falls back to the caller-existence check when the constraint name is missing', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ownerId: OWNER_ID,
        name: 'Summer 100k',
      });
      prisma.eventParticipant.create.mockRejectedValue(prismaError('P2003'));

      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.join(USER_ID, 'event-1')).rejects.toThrow(
        UnauthorizedException,
      );

      prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
      await expect(service.join(USER_ID, 'event-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('leave', () => {
    it('removes the participant row idempotently and answers the updated event (AC2)', async () => {
      prisma.event.findUnique
        .mockResolvedValueOnce({ ownerId: OWNER_ID })
        .mockResolvedValue(eventRow());
      prisma.eventParticipant.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.leave(USER_ID, 'event-1')).resolves.toMatchObject({
        id: 'event-1',
        joined: false,
      });

      expect(prisma.eventParticipant.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', userId: USER_ID },
      });
    });

    it('refuses the owner leaving their own event (AC2)', async () => {
      prisma.event.findUnique.mockResolvedValue({ ownerId: USER_ID });

      await expect(service.leave(USER_ID, 'event-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.eventParticipant.deleteMany).not.toHaveBeenCalled();
    });

    it('404s an event that does not exist (review fix: was a silent 204, but the response now carries the updated event and there is none)', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.leave(USER_ID, 'nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.eventParticipant.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('404s a non-owner and an unknown id alike (AC5)', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.update(USER_ID, 'event-1', { name: 'New name' }),
      ).rejects.toThrow(NotFoundException);
      // The scoped read IS the ownership check.
      expect(prisma.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-1', ownerId: USER_ID },
        }),
      );
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('validates the date order on the MERGED pair, not just the patch', async () => {
      prisma.event.findFirst.mockResolvedValue(eventRow({ ownerId: USER_ID }));

      // Moving only the start past the stored end must fail...
      await expect(
        service.update(USER_ID, 'event-1', {
          startDate: addDaysIso(TOMORROW, 1),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('updates the fields present and answers the updated row (AC5)', async () => {
      prisma.event.findFirst.mockResolvedValue(eventRow({ ownerId: USER_ID }));
      prisma.event.update.mockResolvedValue(
        eventRow({ ownerId: USER_ID, name: 'Autumn 50k', targetKm: null }),
      );

      const result = await service.update(USER_ID, 'event-1', {
        name: 'Autumn 50k',
        targetKm: null,
      });

      expect(prisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-1', ownerId: USER_ID },
          // null clears the goal; absent date fields never touch the data.
          data: { name: 'Autumn 50k', targetKm: null },
        }),
      );
      expect(result.name).toBe('Autumn 50k');
      expect(result.targetKm).toBeNull();
    });

    it('answers an empty PATCH as a plain read without writing', async () => {
      prisma.event.findFirst.mockResolvedValue(eventRow({ ownerId: USER_ID }));
      prisma.event.findUnique.mockResolvedValue(eventRow({ ownerId: USER_ID }));

      const result = await service.update(USER_ID, 'event-1', {});

      expect(result.id).toBe('event-1');
      expect(prisma.event.update).not.toHaveBeenCalled();
      // The pre-read stays lean: only the dates the merged check needs.
      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { id: 'event-1', ownerId: USER_ID },
        select: { startDate: true, endDate: true },
      });
    });

    it('404s when the event vanishes between the read and the write', async () => {
      prisma.event.findFirst.mockResolvedValue(eventRow({ ownerId: USER_ID }));
      prisma.event.update.mockRejectedValue(prismaError('P2025'));

      await expect(
        service.update(USER_ID, 'event-1', { name: 'New name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the owner event (participants cascade at the schema level, AC5)', async () => {
      prisma.event.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.remove(USER_ID, 'event-1')).resolves.toBeUndefined();
      expect(prisma.event.deleteMany).toHaveBeenCalledWith({
        where: { id: 'event-1', ownerId: USER_ID },
      });
    });

    it('404s a non-owner and an unknown id alike (AC5)', async () => {
      prisma.event.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(USER_ID, 'event-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
