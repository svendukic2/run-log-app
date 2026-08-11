import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RunsService } from './runs.service';

// The owner every test acts as (RUN-57: all service methods are scoped).
const USER_ID = 'user-1';

// A stored row as Prisma returns it: the DATE column comes back as a JS Date
// pinned to UTC midnight.
function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'run-1',
    routeName: 'Morning loop',
    distanceKm: 8.2,
    durationSeconds: 2535,
    date: new Date('2026-07-14T00:00:00.000Z'),
    effort: 'Medium',
    note: '',
    userId: USER_ID,
    ...overrides,
  };
}

describe('RunsService', () => {
  let service: RunsService;
  const prisma: {
    run: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
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
