import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
  const prisma: { run: Record<string, jest.Mock> } = {
    run: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [RunsService, { provide: PrismaService, useValue: prisma }],
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

  it('updates only the provided fields, scoped to the owner in the WHERE', async () => {
    prisma.run.updateMany.mockResolvedValue({ count: 1 });
    prisma.run.findFirst.mockResolvedValue(row({ distanceKm: 9 }));

    const updated = await service.update(USER_ID, 'run-1', { distanceKm: 9 });

    expect(prisma.run.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', userId: USER_ID },
      data: { distanceKm: 9 },
    });
    expect(updated.distanceKm).toBe(9);
  });

  it('404s an update of a missing run and of another users run alike (AC3)', async () => {
    prisma.run.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(USER_ID, 'not-mine', { distanceKm: 9 }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.run.findFirst).not.toHaveBeenCalled();
  });

  it('treats an empty PATCH as a no-op read, not a write', async () => {
    prisma.run.findFirst.mockResolvedValue(row());

    const result = await service.update(USER_ID, 'run-1', {});

    expect(result.id).toBe('run-1');
    expect(prisma.run.updateMany).not.toHaveBeenCalled();
  });

  it('lets non-Prisma errors from the database escape untouched', async () => {
    prisma.run.updateMany.mockRejectedValue(new Error('connection reset'));

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
