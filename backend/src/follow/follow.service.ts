import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  PaginationQueryDto,
  resolvePagination,
} from '../common/pagination-query.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { isPrismaError, prismaConstraint } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';

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

// Which list is being read: 'followers' = edges pointing at me, 'following'
// = edges I created. The one string both list endpoints pass down, so every
// shared rule (ordering, page maths, response assembly) exists once.
type ListDirection = 'followers' | 'following';

// The two FK constraint names from the add_follow_model migration. Postgres
// names the violated constraint in the P2003 meta, which is what tells a
// table with two User foreign keys WHICH end broke - deterministically, with
// no second query racing concurrent signups/deletes.
const FOLLOWER_FKEY = 'Follow_followerId_fkey';
const FOLLOWEE_FKEY = 'Follow_followeeId_fkey';

// The follow graph (RUN-61). Every method takes the verified caller's id
// first, like RunsService: the token owner is always the follower/"me" side,
// so no request can write or read an edge on someone else's behalf.
@Injectable()
export class FollowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // Ensures the caller follows the target. Idempotent by way of the unique
  // (followerId, followeeId) pair: the second POST hits P2002 and reports
  // the same final state as the first.
  async follow(userId: string, targetId: string): Promise<FollowStateResponse> {
    if (targetId === userId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    try {
      // Edge and notification commit together (RUN-65 AC1): a repeat POST
      // aborts on P2002 before the notification write, so the followee gets
      // exactly one 'new-follower' per edge, and a failed notification never
      // leaves a follow that silently notified nobody.
      await this.prisma.$transaction(async (tx) => {
        await tx.follow.create({
          data: { followerId: userId, followeeId: targetId },
        });
        await this.notifications.recordNewFollower(tx, targetId, userId);
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        // Already following: the state the caller asked for already holds.
        return { following: true };
      }
      if (isPrismaError(error, 'P2003')) {
        throw await this.mapFollowForeignKeyError(error, userId, targetId);
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
  // youFollow comes from the back-edge lookup.
  followers(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<FollowListResponse> {
    return this.list(userId, query, 'followers');
  }

  // Who I follow. Mirror image: youFollow is true by construction,
  // followsYou comes from the back-edge lookup.
  following(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<FollowListResponse> {
    return this.list(userId, query, 'following');
  }

  // A P2003 from follow.create means one of the two User foreign keys had
  // no row; this decides which error that is. Returned rather than thrown
  // so the caller's control flow stays visible (`throw await ...`).
  private async mapFollowForeignKeyError(
    error: unknown,
    userId: string,
    targetId: string,
  ): Promise<Error> {
    // Deterministic path: the violated constraint is named in the error.
    // The follower side is the caller - a verified token whose account was
    // deleted mid-session - which answers like any other dead session (the
    // runs create path sets this precedent). The followee side is a follow
    // of a nonexistent user: 404, same shape as any unknown id.
    const constraint = prismaConstraint(error);
    if (constraint === FOLLOWER_FKEY) {
      return new UnauthorizedException('Invalid or expired token');
    }
    if (constraint === FOLLOWEE_FKEY) {
      return new NotFoundException(`User ${targetId} not found`);
    }

    // Fallback when the driver put no constraint name in the meta. The
    // caller's row is checked, not the target's: a deleted caller must get
    // 401 even when the target id is also unknown (re-authenticating comes
    // before fixing ids), and a caller that exists cannot be re-created
    // concurrently (cuids never repeat), so this read cannot misfire the
    // way a target-side existence check can when the target signs up right
    // after the failed insert.
    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!caller) return new UnauthorizedException('Invalid or expired token');
    return new NotFoundException(`User ${targetId} not found`);
  }

  // Both list endpoints, once: page the edges, resolve the back-edge state
  // for exactly the users on the page, and assemble the envelope.
  private async list(
    userId: string,
    query: PaginationQueryDto,
    direction: ListDirection,
  ): Promise<FollowListResponse> {
    const { page, pageSize, skip } = resolvePagination(query);

    // The counts depend on nothing below, so they run while the page and
    // back-edge queries (which DO depend on each other) chain in parallel
    // with them, instead of the back-edge lookup queueing behind the
    // slowest count.
    const countsPromise = Promise.all([
      this.prisma.follow.count({ where: { followeeId: userId } }),
      this.prisma.follow.count({ where: { followerId: userId } }),
    ]);
    // If the page query below throws first, nothing ever awaits
    // countsPromise: this no-op handler keeps a simultaneous count failure
    // from crashing the process as an unhandled rejection. The real await
    // further down still surfaces count errors.
    void countsPromise.catch(() => undefined);

    const others = await this.pageOfEdges(userId, direction, skip, pageSize);
    const backEdges = await this.backEdgeSet(
      userId,
      direction,
      others.map((other) => other.id),
    );
    const [followersCount, followingCount] = await countsPromise;

    return {
      items: others.map((other) => ({
        ...other,
        followsYou: direction === 'followers' || backEdges.has(other.id),
        youFollow: direction === 'following' || backEdges.has(other.id),
      })),
      total: direction === 'followers' ? followersCount : followingCount,
      page,
      pageSize,
      counts: { followers: followersCount, following: followingCount },
    };
  }

  // One page of the users on the other end of my edges, newest edge first.
  // The id tiebreak makes the order deterministic within one snapshot of
  // the data; offset pages can still shift when edges are created or
  // removed between two requests (cursor pagination is the upgrade if that
  // ever matters to the frontend).
  private async pageOfEdges(
    userId: string,
    direction: ListDirection,
    skip: number,
    take: number,
  ): Promise<Array<{ id: string; firstName: string; lastName: string }>> {
    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const select = { id: true, firstName: true, lastName: true };

    // The two branches must stay exact mirrors: same order, same select,
    // same page window, only the queried side of the edge differs.
    if (direction === 'followers') {
      const rows = await this.prisma.follow.findMany({
        where: { followeeId: userId },
        orderBy,
        skip,
        take,
        include: { follower: { select } },
      });
      return rows.map((row) => row.follower);
    }
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      orderBy,
      skip,
      take,
      include: { followee: { select } },
    });
    return rows.map((row) => row.followee);
  }

  // The informative half of the follow-state, one IN query per page: for a
  // followers page, which of them I follow back; for a following page,
  // which of them follow me back.
  private async backEdgeSet(
    userId: string,
    direction: ListDirection,
    otherIds: string[],
  ): Promise<Set<string>> {
    if (otherIds.length === 0) return new Set();

    if (direction === 'followers') {
      const edges = await this.prisma.follow.findMany({
        where: { followerId: userId, followeeId: { in: otherIds } },
        select: { followeeId: true },
      });
      return new Set(edges.map((edge) => edge.followeeId));
    }
    const edges = await this.prisma.follow.findMany({
      where: { followeeId: userId, followerId: { in: otherIds } },
      select: { followerId: true },
    });
    return new Set(edges.map((edge) => edge.followerId));
  }
}
