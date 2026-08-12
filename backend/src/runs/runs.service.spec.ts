import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RunsService } from './runs.service';

// The owner every test acts as (RUN-57: all service methods are scoped).
const USER_ID = 'user-1';

// A stored row as Prisma returns it: the DATE column comes back as a JS Date
// pinned to UTC midnight.
function row(overrides: Partial<Record<string, unknown>> = {}) {
  const merged = {
    id: 'run-1',
    routeName: 'Morning loop',
    distanceKm: 8.2,
    durationSeconds: 2535,
    date: new Date('2026-07-14T00:00:00.000Z'),
    effort: 'Medium',
    note: '',
    // A run with no route: all three columns NULL, which is what every run
    // stored before RUN-54 looks like too.
    routePolyline: null,
    routeWaypoints: null,
    routeSource: null,
    // Untagged, like every run stored before RUN-76 and like most runs after it.
    eventId: null,
    userId: USER_ID,
    ...overrides,
  };
  return {
    ...merged,
    // The create/update tests build their expected row by spreading the
    // `data` the service passed to Prisma, and a cleared route carries
    // Prisma.DbNull there - a WRITE sentinel. The database turns it into a
    // plain NULL, so a fixture standing in for a stored row has to do the
    // same translation or it stops resembling one.
    routeWaypoints: Array.isArray(merged.routeWaypoints)
      ? merged.routeWaypoints
      : null,
  };
}

// A row for a run saved WITH a route, and the response object it must
// produce. Kept together so the two cannot drift.
const STORED_ROUTE = {
  routePolyline: 'wap_IsyspAsFgc@cG{h@qFe{A',
  routeWaypoints: [
    { lat: 52.516275, lng: 13.377704 },
    { lat: 52.520008, lng: 13.404954 },
  ],
  routeSource: 'openrouteservice',
};

const ROUTE_RESPONSE = {
  polyline: STORED_ROUTE.routePolyline,
  waypoints: STORED_ROUTE.routeWaypoints,
  source: STORED_ROUTE.routeSource,
  // Never trimmed here: every response from this service is the owner's own
  // run, and the ~300 m privacy trim is for strangers (RUN-55 AC3).
  trimmed: false,
};

describe('RunsService', () => {
  let service: RunsService;
  const prisma: {
    run: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    event: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  } = {
    run: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    // The event lookup behind the tag rules (RUN-76): one findFirst that
    // answers "does this event exist AND has the caller joined it".
    event: {
      findFirst: jest.fn(),
    },
    // The interactive-transaction mock hands the callback the same mock
    // client, so tests assert on prisma.run.create as before; a thrown
    // error escapes exactly like a real aborted transaction.
    $transaction: jest.fn(),
  };
  const notifications = {
    fanOutRunLogged: jest.fn(),
  };

  // What Prisma throws on constraint violations; the service duck-types on
  // the code and the optional meta.constraint, so the mock only needs that
  // shape.
  function prismaError(code: string, constraint?: string) {
    return Object.assign(new Error(`prisma ${code}`), {
      code,
      ...(constraint && { meta: { constraint } }),
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    // A PATCH touching distance or duration pre-reads the stored pair for
    // the sanity limits (RUN-72), so every update test needs a row here;
    // the ones about a particular stored run override it.
    prisma.run.findFirst.mockResolvedValue(row());
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        RunsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = moduleRef.get(RunsService);
  });

  it('lists only the callers runs, newest first with a deterministic tiebreak (AC2)', async () => {
    prisma.run.findMany.mockResolvedValue([row()]);

    const runs = await service.findAll(USER_ID);

    // The owner is part of the query itself, not a JS filter (AC2).
    expect(prisma.run.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    // The response is the contract shape: date is a yyyy-mm-dd string and
    // userId stays internal.
    expect(runs).toEqual([
      {
        id: 'run-1',
        routeName: 'Morning loop',
        distanceKm: 8.2,
        durationSeconds: 2535,
        date: '2026-07-14',
        effort: 'Medium',
        note: '',
        // Every run carries the route key; null is a run with no route
        // (RUN-54 AC3), which is what the list looked like before it existed.
        route: null,
        // Same for the event tag (RUN-76 AC7): the key is always there, null
        // means this run belongs to no event.
        eventId: null,
      },
    ]);
  });

  it('returns one run by id scoped to the owner and 404s on a miss', async () => {
    prisma.run.findFirst.mockResolvedValueOnce(row());
    await expect(service.findOne(USER_ID, 'run-1')).resolves.toMatchObject({
      id: 'run-1',
      date: '2026-07-14',
    });
    expect(prisma.run.findFirst).toHaveBeenCalledWith({
      where: { id: 'run-1', userId: USER_ID },
    });

    // A row that exists but belongs to someone else never comes back from
    // the scoped query, so the 404 is indistinguishable from a bad id (AC3).
    prisma.run.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne(USER_ID, 'someone-elses')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('fails loudly on a stored effort outside the contract vocabulary', async () => {
    // Plain TEXT column until the schema-hardening ticket adds an enum: a
    // row edited via psql can hold anything, and that must not reach the
    // frontend as a silently wrong Effort.
    prisma.run.findFirst.mockResolvedValue(row({ effort: 'banana' }));

    await expect(service.findOne(USER_ID, 'run-1')).rejects.toThrow(
      /Run run-1 has stored effort "banana"/,
    );
  });

  it('creates with the owner and the calendar day stored at UTC midnight', async () => {
    prisma.run.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...data, id: 'run-2' })),
    );

    const created = await service.create(USER_ID, {
      routeName: 'Track intervals',
      distanceKm: 5,
      durationSeconds: 1500,
      date: '2026-08-03',
      effort: 'Hard',
      note: 'humid',
    });

    expect(prisma.run.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining is typed any
      data: expect.objectContaining({
        userId: USER_ID,
        date: new Date('2026-08-03T00:00:00.000Z'),
        effort: 'Hard',
        note: 'humid',
      }),
    });
    expect(created.date).toBe('2026-08-03');
    // The fan-out rides the same transaction client with the stored run's
    // headline stats (RUN-65 AC2).
    expect(notifications.fanOutRunLogged).toHaveBeenCalledWith(
      prisma,
      USER_ID,

      expect.objectContaining({ id: 'run-2', date: '2026-08-03' }),
    );
  });

  it('defaults effort to Medium and note to empty when omitted (ADD-8)', async () => {
    prisma.run.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...data, id: 'run-3' })),
    );

    await service.create(USER_ID, {
      routeName: 'Recovery jog',
      distanceKm: 3,
      durationSeconds: 1200,
      date: '2026-08-01',
    });

    expect(prisma.run.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining is typed any
      data: expect.objectContaining({ effort: 'Medium', note: '' }),
    });
  });

  it('answers 401 straight from the named owner constraint: the callers account is gone', async () => {
    prisma.run.create.mockRejectedValue(
      prismaError('P2003', 'Run_userId_fkey'),
    );

    await expect(
      service.create('deleted-user', {
        routeName: 'Ghost run',
        distanceKm: 5,
        durationSeconds: 1500,
        date: '2026-08-03',
      }),
    ).rejects.toThrow(UnauthorizedException);
    // The constraint name told the whole story: no second query, no retry.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('retries once when a follower vanished mid-fan-out instead of answering 401', async () => {
    // First attempt: the notification insert hits the recipient FK because
    // a follower's account was deleted between the read and the insert.
    // Second attempt: the cascade removed their edge, so it succeeds.
    prisma.run.create
      .mockRejectedValueOnce(prismaError('P2003', 'Notification_userId_fkey'))
      .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...data, id: 'run-4' })),
      );

    const created = await service.create(USER_ID, {
      routeName: 'Raced run',
      distanceKm: 5,
      durationSeconds: 1500,
      date: '2026-08-03',
    });

    expect(created.id).toBe('run-4');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('gives up after one fan-out retry and lets the error escape', async () => {
    prisma.run.create.mockRejectedValue(
      prismaError('P2003', 'Notification_userId_fkey'),
    );

    await expect(
      service.create(USER_ID, {
        routeName: 'Cursed run',
        distanceKm: 5,
        durationSeconds: 1500,
        date: '2026-08-03',
      }),
    ).rejects.toThrow('prisma P2003');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('falls back to a caller-existence check when P2003 names no constraint: dead session wins', async () => {
    prisma.run.create.mockRejectedValue(prismaError('P2003'));
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.create('deleted-user', {
        routeName: 'Ghost run',
        distanceKm: 5,
        durationSeconds: 1500,
        date: '2026-08-03',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'deleted-user' },
      select: { id: true },
    });
  });

  it('retries the ambiguous no-constraint P2003 when the caller still exists', async () => {
    prisma.run.create
      .mockRejectedValueOnce(prismaError('P2003'))
      .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...data, id: 'run-5' })),
      );
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });

    const created = await service.create(USER_ID, {
      routeName: 'Raced run',
      distanceKm: 5,
      durationSeconds: 1500,
      date: '2026-08-03',
    });

    expect(created.id).toBe('run-5');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('updates atomically with the owner inside the unique WHERE', async () => {
    prisma.run.update.mockResolvedValue(row({ distanceKm: 9 }));

    const updated = await service.update(USER_ID, 'run-1', { distanceKm: 9 });

    // One query carrying {id, userId}: no read-back a concurrent writer
    // could race (Prisma 7 WhereUniqueInput accepts the non-unique field).
    expect(prisma.run.update).toHaveBeenCalledWith({
      where: { id: 'run-1', userId: USER_ID },
      data: { distanceKm: 9 },
    });
    expect(updated.distanceKm).toBe(9);
  });

  // RUN-72 AC1. The limits themselves are checked at every boundary in
  // common/runLimits.spec.ts; these two prove the wiring, which is the part
  // that could silently apply to create only.
  it('refuses a run beyond the hard limits before writing anything (RUN-72 AC1)', async () => {
    await expect(
      service.create(USER_ID, {
        routeName: 'Teleport',
        distanceKm: 200,
        durationSeconds: 3600,
        date: '2026-07-14',
      }),
      // The message is the one the Add run form shows inline, so it names
      // the number to fix rather than a DTO field.
    ).rejects.toThrow('Distance must be at most 150 km per run.');
    expect(prisma.run.create).not.toHaveBeenCalled();
  });

  it('applies the pace limit to the merged pair on PATCH, not to the field sent (RUN-72 AC1)', async () => {
    // Stored: 8.2 km. The PATCH only shortens the time, which is legal on
    // its own and impossible against the distance already stored.
    await expect(
      service.update(USER_ID, 'run-1', { durationSeconds: 600 }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.run.update).not.toHaveBeenCalled();
  });

  it('404s an update of a missing run and of another users run alike (AC3)', async () => {
    prisma.run.update.mockRejectedValue(prismaError('P2025'));

    await expect(
      service.update(USER_ID, 'not-mine', { distanceKm: 9 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('treats an empty PATCH as a no-op read, not a write', async () => {
    prisma.run.findFirst.mockResolvedValue(row());

    const result = await service.update(USER_ID, 'run-1', {});

    expect(result.id).toBe('run-1');
    expect(prisma.run.update).not.toHaveBeenCalled();
  });

  it('lets non-Prisma errors from the database escape untouched', async () => {
    prisma.run.update.mockRejectedValue(new Error('connection reset'));

    await expect(
      service.update(USER_ID, 'run-1', { distanceKm: 9 }),
    ).rejects.toThrow('connection reset');
  });

  /* The optional route (RUN-54) ------------------------------------------- */

  it('stores a drawn route and stamps the source itself (AC4)', async () => {
    prisma.run.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...data, id: 'run-6' })),
    );

    const created = await service.create(USER_ID, {
      routeName: 'Routed run',
      distanceKm: 5,
      durationSeconds: 1500,
      date: '2026-08-03',
      route: {
        polyline: STORED_ROUTE.routePolyline,
        waypoints: STORED_ROUTE.routeWaypoints,
      },
    });

    expect(prisma.run.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining is typed any
      data: expect.objectContaining(STORED_ROUTE),
    });
    // The client never sends a source and could not be trusted with one: the
    // polyline can only have come from our own routing proxy, so the server
    // knows who drew it.
    expect(created.route).toEqual(ROUTE_RESPONSE);
  });

  it('clears the route on an explicit null and leaves it alone when absent (AC5)', async () => {
    prisma.run.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...STORED_ROUTE, ...data })),
    );

    await service.update(USER_ID, 'run-1', { route: null });
    // DbNull, not null: Prisma needs the sentinel to put SQL NULL into a
    // nullable Json column.
    expect(prisma.run.update).toHaveBeenCalledWith({
      where: { id: 'run-1', userId: USER_ID },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining is typed any
      data: expect.objectContaining({
        routePolyline: null,
        routeWaypoints: Prisma.DbNull,
        routeSource: null,
      }),
    });

    // An edit that never opened the Route step must not wipe the route it
    // never saw, which is why the three cases (absent / null / object) are
    // distinguished rather than collapsed into "falsy".
    const kept = await service.update(USER_ID, 'run-1', { distanceKm: 9 });
    expect(prisma.run.update).toHaveBeenLastCalledWith({
      where: { id: 'run-1', userId: USER_ID },
      data: { distanceKm: 9 },
    });
    expect(kept.route).toEqual(ROUTE_RESPONSE);
  });

  it('fails loudly on a half-written route rather than serving one the picker cannot restore', async () => {
    // Only reachable by editing the row outside the API - the database CHECK
    // rejects this combination - but a polyline with no waypoints would leave
    // Edit unable to restore or move anything, silently.
    prisma.run.findFirst.mockResolvedValue(
      row({
        routePolyline: 'wap_IsyspAsFgc@cG{h@qFe{A',
        routeSource: 'openrouteservice',
      }),
    );

    await expect(service.findOne(USER_ID, 'run-1')).rejects.toThrow(
      /Run run-1 has an unreadable route/,
    );
  });

  /* The event tag (RUN-76) ------------------------------------------------ */

  // Every test here goes straight at the service, which is the point: AC3 asks
  // for the rules to be enforced where a client cannot reach around them, so
  // the form is not involved in proving any of it.
  describe('event tagging', () => {
    // An event the caller has joined, containing 2026-08-03.
    const JOINED_EVENT = {
      name: 'Summer 100k',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-31T00:00:00.000Z'),
    };

    function validRun() {
      return {
        routeName: 'Event run',
        distanceKm: 8,
        durationSeconds: 2400,
        date: '2026-08-03',
      };
    }

    it('stores the tag when the caller joined the event and the date is inside it (AC1)', async () => {
      prisma.event.findFirst.mockResolvedValue(JOINED_EVENT);
      prisma.run.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(row({ ...data, id: 'run-7' })),
      );

      const created = await service.create(USER_ID, {
        ...validRun(),
        eventId: 'event-1',
      });

      expect(created.eventId).toBe('event-1');
      // Membership is the WHERE clause, not a filter applied afterwards: one
      // query answers "exists" and "joined" together, which is also what makes
      // the two indistinguishable to the caller.
      expect(prisma.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'event-1',
            participants: { some: { userId: USER_ID } },
          },
        }),
      );
    });

    it('rejects an event the caller has not joined, and stores nothing (AC3)', async () => {
      // An unknown id and an unjoined event are the same empty result, which is
      // why one message covers both: a run POST must not be a way to find out
      // which event ids exist.
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, { ...validRun(), eventId: 'event-theirs' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.run.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['before the window', '2026-07-31'],
      ['after the window', '2026-09-01'],
    ])(
      'rejects a run dated %s, and stores nothing (AC3)',
      async (_case, date) => {
        prisma.event.findFirst.mockResolvedValue(JOINED_EVENT);

        await expect(
          service.create(USER_ID, { ...validRun(), date, eventId: 'event-1' }),
        ).rejects.toThrow(/must fall inside Summer 100k/);
        expect(prisma.run.create).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['the first day', '2026-08-01'],
      ['the last day', '2026-08-31'],
    ])(
      'accepts a run dated on %s: the window is inclusive',
      async (_case, date) => {
        prisma.event.findFirst.mockResolvedValue(JOINED_EVENT);
        prisma.run.create.mockImplementation(
          ({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve(row({ ...data })),
        );

        await expect(
          service.create(USER_ID, { ...validRun(), date, eventId: 'event-1' }),
        ).resolves.toMatchObject({ eventId: 'event-1' });
      },
    );

    it('untags on an explicit null and leaves the tag alone when absent (AC6)', async () => {
      prisma.run.findFirst.mockResolvedValue(
        row({ eventId: 'event-1', date: new Date('2026-08-03T00:00:00.000Z') }),
      );
      prisma.run.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(row({ eventId: 'event-1', ...data })),
      );

      const untagged = await service.update(USER_ID, 'run-1', {
        eventId: null,
      });
      expect(untagged.eventId).toBeNull();
      // No event lookup at all: there is no event left to be outside of.
      expect(prisma.event.findFirst).not.toHaveBeenCalled();

      // A PATCH that says nothing about the event keeps it, exactly like the
      // route - an edit that never touched the picker cannot lose the tag.
      const kept = await service.update(USER_ID, 'run-1', {
        routeName: 'Renamed',
      });
      expect(prisma.run.update).toHaveBeenLastCalledWith({
        where: { id: 'run-1', userId: USER_ID },
        data: { routeName: 'Renamed' },
      });
      expect(kept.eventId).toBe('event-1');
    });

    // The merged-pair rule, and the case a naive implementation gets wrong:
    // the PATCH says nothing about the event, so the tag has to be re-checked
    // against the NEW date rather than left alone.
    it('rejects a date move that would take a tagged run out of its event (AC3)', async () => {
      prisma.run.findFirst.mockResolvedValue(
        row({ eventId: 'event-1', date: new Date('2026-08-03T00:00:00.000Z') }),
      );
      prisma.event.findFirst.mockResolvedValue(JOINED_EVENT);

      await expect(
        service.update(USER_ID, 'run-1', { date: '2026-09-05' }),
      ).rejects.toThrow(/must fall inside Summer 100k/);
      expect(prisma.run.update).not.toHaveBeenCalled();
    });

    // The mirror image: the PATCH says nothing about the date, so the new tag
    // is checked against the STORED one.
    it('checks a new tag against the stored date (AC3)', async () => {
      prisma.run.findFirst.mockResolvedValue(
        row({ date: new Date('2026-07-14T00:00:00.000Z') }),
      );
      prisma.event.findFirst.mockResolvedValue(JOINED_EVENT);

      await expect(
        service.update(USER_ID, 'run-1', { eventId: 'event-1' }),
      ).rejects.toThrow(/must fall inside Summer 100k/);
      expect(prisma.run.update).not.toHaveBeenCalled();
    });

    // The review finding: the FK is the backstop for an event deleted between
    // the tag check and the insert, and it used to escape as a 500. Nothing was
    // stored either way; what changes is that the caller is told why.
    it('answers 400 when the event vanishes between the check and the write', async () => {
      prisma.event.findFirst.mockResolvedValue(JOINED_EVENT);
      prisma.run.create.mockRejectedValue(
        prismaError('P2003', 'Run_eventId_fkey'),
      );

      await expect(
        service.create(USER_ID, { ...validRun(), eventId: 'event-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('answers 400 for the same race on a PATCH', async () => {
      prisma.run.findFirst.mockResolvedValue(
        row({ date: new Date('2026-08-03T00:00:00.000Z') }),
      );
      prisma.event.findFirst.mockResolvedValue(JOINED_EVENT);
      prisma.run.update.mockRejectedValue(
        prismaError('P2003', 'Run_eventId_fkey'),
      );

      await expect(
        service.update(USER_ID, 'run-1', { eventId: 'event-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('never looks an event up for an untagged run (AC7)', async () => {
      prisma.run.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(row({ ...data })),
      );

      const created = await service.create(USER_ID, validRun());

      expect(created.eventId).toBeNull();
      expect(prisma.event.findFirst).not.toHaveBeenCalled();
    });
  });

  it('deletes scoped to the owner and 404s when nothing matched', async () => {
    prisma.run.deleteMany.mockResolvedValueOnce({ count: 1 });
    await service.remove(USER_ID, 'run-1');
    expect(prisma.run.deleteMany).toHaveBeenCalledWith({
      where: { id: 'run-1', userId: USER_ID },
    });

    prisma.run.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.remove(USER_ID, 'not-mine')).rejects.toThrow(
      NotFoundException,
    );
  });
});
