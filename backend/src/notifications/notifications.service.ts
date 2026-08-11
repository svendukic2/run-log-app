import { Injectable, NotFoundException } from '@nestjs/common';
import {
  newestFirstOrder,
  PaginationQueryDto,
  resolvePagination,
} from '../common/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
// Value import, not type-only: TransactionIsolationLevel is read at runtime.
import { Prisma } from '../generated/prisma/client';
import type { Notification as NotificationRow } from '../generated/prisma/client';

// The notification vocabulary (RUN-65). 'event-joined' is defined now so the
// payload contract exists before events do; nothing writes it until events
// land in C2.
export const NOTIFICATION_TYPES = [
  'new-follower',
  'followed-ran',
  'event-joined',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Every payload is a self-contained snapshot taken at write time (AC4): the
// actor's name and the run's headline stats are copied in, never joined at
// read time, so a later unfollow, account deletion or run delete can never
// break rendering a notification that already landed.
//
// Type aliases, not interfaces, on purpose: aliases get TypeScript's implicit
// index signature, which is what lets them flow into Prisma's InputJsonValue
// without a cast at every write site.

// Someone started following you (AC1).
export type NewFollowerPayload = {
  followerId: string;
  firstName: string;
  lastName: string;
};

// Someone you follow logged a run (AC2): run id plus the headline stats the
// bell renders without fetching the run.
export type FollowedRanPayload = {
  runnerId: string;
  firstName: string;
  lastName: string;
  runId: string;
  routeName: string;
  distanceKm: number;
  durationSeconds: number;
  date: string; // yyyy-mm-dd, like every calendar day in the contract
};

// Someone joined your event. Contract only until C2 activates events.
export type EventJoinedPayload = {
  joinerId: string;
  firstName: string;
  lastName: string;
  eventId: string;
  eventName: string;
};

export type NotificationPayload =
  NewFollowerPayload | FollowedRanPayload | EventJoinedPayload;

// The API shape of one notification. Timestamps are full ISO instants, not
// calendar days: the bell renders "2h ago". type stays a plain string on
// read so an unknown stored value degrades to an item the frontend skips,
// never a crashed list (the AC4 spirit; contrast toEffort in runs).
export interface NotificationResponse {
  id: string;
  type: string;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationResponse[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}

// createMany fan-out is chunked so one very followed runner cannot push a
// single INSERT past Postgres' 65535-parameter limit. 1000 rows per
// statement stays far under it at our column count.
const FAN_OUT_CHUNK = 1000;

// Writers run on the caller's transaction client: a follow and its
// notification (or a run and its fan-out) commit together or not at all, so
// no retry can double-notify and no crash can leave a follow without its
// notification. Readers run on the service's own client.
type Db = Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // AC1: B followed A -> A gets one 'new-follower' with B's id and name.
  // Called only when the edge was actually created; the idempotent repeat
  // follow never reaches this, which is what keeps it at exactly one.
  async recordNewFollower(
    db: Db,
    followeeId: string,
    followerId: string,
  ): Promise<void> {
    // Bounds the follow/unfollow spam loop: while the followee still has an
    // UNREAD new-follower from this same actor, a fresh edge writes nothing,
    // so churning the endpoint cannot grow the bell by more than one row per
    // actor. Reading the old notification re-arms it, which keeps a genuine
    // re-follow months later visible.
    const alreadyPending = await db.notification.findFirst({
      where: {
        userId: followeeId,
        type: 'new-follower' satisfies NotificationType,
        readAt: null,
        payload: { path: ['followerId'], equals: followerId },
      },
      select: { id: true },
    });
    if (alreadyPending) return;

    // The follow row's FK just verified the follower exists, so inside this
    // transaction the name lookup cannot miss; OrThrow turns the impossible
    // case into a loud error instead of a nameless notification.
    const follower = await db.user.findUniqueOrThrow({
      where: { id: followerId },
      select: { firstName: true, lastName: true },
    });
    const payload: NewFollowerPayload = {
      followerId,
      firstName: follower.firstName,
      lastName: follower.lastName,
    };
    await db.notification.create({
      data: {
        userId: followeeId,
        type: 'new-follower' satisfies NotificationType,
        payload,
      },
    });
  }

  // AC2: the runner logged a run -> every follower gets one 'followed-ran'.
  // Batched per run: one query for the follower ids, one createMany per
  // chunk - never a query or insert per follower.
  async fanOutRunLogged(
    db: Db,
    runnerId: string,
    run: {
      id: string;
      routeName: string;
      distanceKm: number;
      durationSeconds: number;
      date: string;
    },
  ): Promise<void> {
    const followers = await db.follow.findMany({
      where: { followeeId: runnerId },
      select: { followerId: true },
    });
    if (followers.length === 0) return;

    const runner = await db.user.findUniqueOrThrow({
      where: { id: runnerId },
      select: { firstName: true, lastName: true },
    });
    const payload: FollowedRanPayload = {
      runnerId,
      firstName: runner.firstName,
      lastName: runner.lastName,
      runId: run.id,
      routeName: run.routeName,
      distanceKm: run.distanceKm,
      durationSeconds: run.durationSeconds,
      date: run.date,
    };

    for (let at = 0; at < followers.length; at += FAN_OUT_CHUNK) {
      const chunk = followers.slice(at, at + FAN_OUT_CHUNK);
      await db.notification.createMany({
        data: chunk.map(({ followerId }) => ({
          userId: followerId,
          type: 'followed-ran' satisfies NotificationType,
          payload,
        })),
      });
    }
  }

  // AC3: newest first, paginated, with the unread count for the bell badge.
  async list(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<NotificationListResponse> {
    const { page, pageSize, skip } = resolvePagination(query);

    const [rows, total, unreadCount] = await this.prisma.$transaction(
      [
        this.prisma.notification.findMany({
          where: { userId },
          orderBy: newestFirstOrder(),
          skip,
          take: pageSize,
        }),
        this.prisma.notification.count({ where: { userId } }),
        this.prisma.notification.count({ where: { userId, readAt: null } }),
      ],
      // One snapshot for all three: under the default READ COMMITTED each
      // statement sees its own state, so a read-all or an incoming follow
      // committing between them could make items and counts disagree
      // inside a single response (unread rows shown while unreadCount says
      // 0). RepeatableRead pins the batch to one snapshot.
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      items: rows.map((row) => this.toResponse(row)),
      total,
      page,
      pageSize,
      unreadCount,
    };
  }

  // AC3: mark one read. Idempotent on repeat: the readAt-null filter means a
  // second call matches nothing and the original timestamp survives. The
  // read-back distinguishes "already read" (return as-is) from "not yours or
  // not there" (404, same shape as every scoped miss in the app).
  async markRead(userId: string, id: string): Promise<NotificationResponse> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException(`Notification ${id} not found`);
    return this.toResponse(row);
  }

  // AC3: mark everything read in one statement; answers how many actually
  // flipped so the frontend can reconcile its badge without a refetch.
  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  private toResponse(row: NotificationRow): NotificationResponse {
    return {
      id: row.id,
      type: row.type,
      // Stored once at write time and passed through untouched: rendering
      // never depends on the actor or run still existing (AC4).
      payload: row.payload as NotificationPayload,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
