import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { FollowService } from './follow.service';

// The caller every test acts as: always the follower/"me" side.
const USER_ID = 'user-me';
const TARGET_ID = 'user-target';

// A follow row as findMany returns it with the related user included.
function edgeWith(
  side: 'follower' | 'followee',
  user: { id: string; firstName: string; lastName: string },
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: `follow-${user.id}`,
    followerId: side === 'follower' ? user.id : USER_ID,
    followeeId: side === 'followee' ? user.id : USER_ID,
    createdAt: new Date('2026-08-11T10:00:00.000Z'),
    [side]: user,
    ...overrides,
  };
}

const ANA = { id: 'user-ana', firstName: 'Ana', lastName: 'Tester' };
const BRUNO = { id: 'user-bruno', firstName: 'Bruno', lastName: 'Tester' };

describe('FollowService', () => {
  let service: FollowService;
  const prisma: {
    follow: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
  } = {
    follow: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
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
    const moduleRef = await Test.createTestingModule({
      providers: [FollowService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(FollowService);
  });

  describe('follow', () => {
    it('creates the edge with the caller as follower', async () => {
      prisma.follow.create.mockResolvedValue({});

      await expect(service.follow(USER_ID, TARGET_ID)).resolves.toEqual({
        following: true,
      });
      expect(prisma.follow.create).toHaveBeenCalledWith({
        data: { followerId: USER_ID, followeeId: TARGET_ID },
      });
    });

    it('rejects following yourself with a 400 before touching the database (AC1)', async () => {
      await expect(service.follow(USER_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.follow.create).not.toHaveBeenCalled();
    });

    it('treats a repeated follow as a no-op with the same answer (AC1, P2002)', async () => {
      prisma.follow.create.mockRejectedValue(prismaError('P2002'));

      await expect(service.follow(USER_ID, TARGET_ID)).resolves.toEqual({
        following: true,
      });
    });

    it('404s a follow of a nonexistent user straight from the named followee constraint (P2003)', async () => {
      prisma.follow.create.mockRejectedValue(
        prismaError('P2003', 'Follow_followeeId_fkey'),
      );

      await expect(service.follow(USER_ID, 'no-such-user')).rejects.toThrow(
        NotFoundException,
      );
      // The constraint name told the whole story: no second query.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('answers 401 straight from the named follower constraint: the caller was deleted (P2003)', async () => {
      prisma.follow.create.mockRejectedValue(
        prismaError('P2003', 'Follow_followerId_fkey'),
      );

      await expect(service.follow('deleted-user', TARGET_ID)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('falls back to a caller-existence check when P2003 names no constraint: dead session wins', async () => {
      prisma.follow.create.mockRejectedValue(prismaError('P2003'));
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.follow('deleted-user', TARGET_ID)).rejects.toThrow(
        UnauthorizedException,
      );
      // The CALLER is checked, not the target: a deleted caller gets 401
      // even when the target id is also unknown - re-authenticating comes
      // before fixing ids.
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'deleted-user' },
        select: { id: true },
      });
    });

    it('falls back to 404 when P2003 names no constraint and the caller still exists', async () => {
      prisma.follow.create.mockRejectedValue(prismaError('P2003'));
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID });

      await expect(service.follow(USER_ID, 'no-such-user')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lets non-Prisma errors escape untouched', async () => {
      prisma.follow.create.mockRejectedValue(new Error('connection reset'));

      await expect(service.follow(USER_ID, TARGET_ID)).rejects.toThrow(
        'connection reset',
      );
    });
  });

  describe('unfollow', () => {
    it('deletes exactly the callers edge to the target (AC2)', async () => {
      prisma.follow.deleteMany.mockResolvedValue({ count: 1 });

      await service.unfollow(USER_ID, TARGET_ID);

      expect(prisma.follow.deleteMany).toHaveBeenCalledWith({
        where: { followerId: USER_ID, followeeId: TARGET_ID },
      });
    });

    it('succeeds silently when there was no edge to remove (idempotent)', async () => {
      prisma.follow.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.unfollow(USER_ID, TARGET_ID),
      ).resolves.toBeUndefined();
    });
  });

  describe('followers', () => {
    it('pages the followee-scoped query and marks who I follow back (AC3)', async () => {
      prisma.follow.findMany
        // The page of followers itself...
        .mockResolvedValueOnce([
          edgeWith('follower', ANA),
          edgeWith('follower', BRUNO),
        ])
        // ...then the back-edge lookup: I follow Ana, not Bruno.
        .mockResolvedValueOnce([{ followeeId: ANA.id }]);
      prisma.follow.count
        .mockResolvedValueOnce(12) // followers
        .mockResolvedValueOnce(3); // following

      const result = await service.followers(USER_ID, {
        page: 2,
        pageSize: 2,
      });

      expect(prisma.follow.findMany).toHaveBeenNthCalledWith(1, {
        where: { followeeId: USER_ID },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 2,
        take: 2,
        include: {
          follower: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      expect(prisma.follow.findMany).toHaveBeenNthCalledWith(2, {
        where: { followerId: USER_ID, followeeId: { in: [ANA.id, BRUNO.id] } },
        select: { followeeId: true },
      });
      expect(result).toEqual({
        items: [
          { ...ANA, followsYou: true, youFollow: true },
          { ...BRUNO, followsYou: true, youFollow: false },
        ],
        total: 12,
        page: 2,
        pageSize: 2,
        counts: { followers: 12, following: 3 },
      });
    });

    it('skips the back-edge query entirely on an empty page', async () => {
      prisma.follow.findMany.mockResolvedValueOnce([]);
      prisma.follow.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const result = await service.followers(USER_ID, {});

      expect(result.items).toEqual([]);
      // Only the page query ran; no IN () lookup for zero users.
      expect(prisma.follow.findMany).toHaveBeenCalledTimes(1);
      // Defaults applied: first page, 20 per page.
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });
  });

  describe('following', () => {
    it('pages the follower-scoped query and marks who follows me back (AC3)', async () => {
      prisma.follow.findMany
        .mockResolvedValueOnce([
          edgeWith('followee', ANA),
          edgeWith('followee', BRUNO),
        ])
        // Reverse edges: Bruno follows me back, Ana does not.
        .mockResolvedValueOnce([{ followerId: BRUNO.id }]);
      prisma.follow.count
        .mockResolvedValueOnce(3) // followers
        .mockResolvedValueOnce(12); // following

      const result = await service.following(USER_ID, { pageSize: 2 });

      expect(prisma.follow.findMany).toHaveBeenNthCalledWith(1, {
        where: { followerId: USER_ID },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 2,
        include: {
          followee: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      expect(result).toEqual({
        items: [
          { ...ANA, followsYou: false, youFollow: true },
          { ...BRUNO, followsYou: true, youFollow: true },
        ],
        // total is the size of THIS list: what I follow.
        total: 12,
        page: 1,
        pageSize: 2,
        counts: { followers: 3, following: 12 },
      });
    });
  });
});
