import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isPrismaError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_PAGE_SIZE,
  PaginationQueryDto,
} from './dto/pagination-query.dto';

// What POST /users/:id/follow answers: the state the call guaranteed, not
// whether this particular request inserted the row (idempotency makes that
// distinction meaningless to the caller).
export interface FollowStateResponse {
  following: boolean;
}

// One entry in a followers/following list: id + name (AC3) plus both
// directions of the relationship, so the frontend can render "Follows you"
// badges and follow/unfollow buttons from the list alone. One of the two
// booleans is always true by construction (that is what put the user in the
// list); the other is the informative one.
export interface FollowListUser {
  id: string;
  firstName: string;
  lastName: string;
  followsYou: boolean;
  youFollow: boolean;
}

// `total` is the size of the requested list; `counts` carries both follow
// counts (ticket: "with follow counts") so one call renders the whole
// profile header.
export interface FollowListResponse {
  items: FollowListUser[];
  total: number;
  page: number;
  pageSize: number;
  counts: {
    followers: number;
    following: number;
  };
}

// The follow graph (RUN-61). Every method takes the verified caller's id
// first, like RunsService: the token owner is always the follower/"me" side,
// so no request can write or read an edge on someone else's behalf.
@Injectable()
export class FollowService {
  constructor(private readonly prisma: PrismaService) {}

  // Ensures the caller follows the target. Idempotent by way of the unique
  // (followerId, followeeId) pair: the second POST hits P2002 and reports
  // the same final state as the first.
  async follow(userId: string, targetId: string): Promise<FollowStateResponse> {
    if (targetId === userId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    try {
      await this.prisma.follow.create({
        data: { followerId: userId, followeeId: targetId },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        // Already following: the state the caller asked for already holds.
        return { following: true };
      }
      if (isPrismaError(error, 'P2003')) {
        // One of the two user foreign keys has no row, and the error code
        // does not say which. Look at the target: if it is missing, this is
        // a follow of a nonexistent user (404, same shape as any unknown
        // id). If the target exists, the broken key can only be the caller
        // - a verified token whose account was deleted mid-session - which
        // answers like any other dead session (the runs create path sets
        // this precedent).
        const target = await this.prisma.user.findUnique({
          where: { id: targetId },
          select: { id: true },
        });
        if (!target) throw new NotFoundException(`User ${targetId} not found`);
        throw new UnauthorizedException('Invalid or expired token');
      }
      throw error;
    }
    return { following: true };
  }

  // Ensures the caller does not follow the target. Idempotent like follow():
  // deleting an edge that is not there (never followed, already unfollowed,
  // or the target never existed) leaves the world in the requested state, so
  // it succeeds silently rather than 404ing - the AC only specifies that an
  // existing row is removed.
  async unfollow(userId: string, targetId: string): Promise<void> {
    await this.prisma.follow.deleteMany({
      where: { followerId: userId, followeeId: targetId },
    });
  }

  // Who follows me. followsYou is true for every entry by construction;
  // youFollow is looked up per page in one IN query.
  async followers(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<FollowListResponse> {
    const { page, pageSize, skip } = resolvePagination(query);

    const [rows, followersCount, followingCount] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followeeId: userId },
        // Newest follower first; same-instant rows tiebreak on id so pages
        // never overlap or skip between requests.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: {
          follower: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.countFollowers(userId),
      this.countFollowing(userId),
    ]);

    const followedBack = await this.followedByMe(
      userId,
      rows.map((row) => row.follower.id),
    );

    return {
      items: rows.map((row) => ({
        id: row.follower.id,
        firstName: row.follower.firstName,
        lastName: row.follower.lastName,
        followsYou: true,
        youFollow: followedBack.has(row.follower.id),
      })),
      total: followersCount,
      page,
      pageSize,
      counts: { followers: followersCount, following: followingCount },
    };
  }

  // Who I follow. Mirror image of followers(): youFollow is true by
  // construction, followsYou comes from the reverse-edge lookup.
  async following(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<FollowListResponse> {
    const { page, pageSize, skip } = resolvePagination(query);

    const [rows, followersCount, followingCount] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: {
          followee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.countFollowers(userId),
      this.countFollowing(userId),
    ]);

    const followsMeBack = await this.followingMe(
      userId,
      rows.map((row) => row.followee.id),
    );

    return {
      items: rows.map((row) => ({
        id: row.followee.id,
        firstName: row.followee.firstName,
        lastName: row.followee.lastName,
        followsYou: followsMeBack.has(row.followee.id),
        youFollow: true,
      })),
      total: followingCount,
      page,
      pageSize,
      counts: { followers: followersCount, following: followingCount },
    };
  }

  private countFollowers(userId: string): Promise<number> {
    return this.prisma.follow.count({ where: { followeeId: userId } });
  }

  private countFollowing(userId: string): Promise<number> {
    return this.prisma.follow.count({ where: { followerId: userId } });
  }

  // Of the given users, the ones I follow - one query for the whole page.
  private async followedByMe(
    userId: string,
    otherIds: string[],
  ): Promise<Set<string>> {
    if (otherIds.length === 0) return new Set();
    const edges = await this.prisma.follow.findMany({
      where: { followerId: userId, followeeId: { in: otherIds } },
      select: { followeeId: true },
    });
    return new Set(edges.map((edge) => edge.followeeId));
  }

  // Of the given users, the ones that follow me.
  private async followingMe(
    userId: string,
    otherIds: string[],
  ): Promise<Set<string>> {
    if (otherIds.length === 0) return new Set();
    const edges = await this.prisma.follow.findMany({
      where: { followeeId: userId, followerId: { in: otherIds } },
      select: { followerId: true },
    });
    return new Set(edges.map((edge) => edge.followerId));
  }
}

function resolvePagination(query: PaginationQueryDto): {
  page: number;
  pageSize: number;
  skip: number;
} {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize };
}
