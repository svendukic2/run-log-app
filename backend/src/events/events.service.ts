import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { toDbDate, toIsoDate, utcTodayIso } from '../common/dates';
import { resolvePagination } from '../common/pagination-query.dto';
import { appearsOnLeaderboard } from '../common/privacy';
import { NotificationsService } from '../notifications/notifications.service';
import { isPrismaError, prismaConstraint } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
// Value import: TransactionIsolationLevel is read at runtime (list batch).
import { Prisma } from '../generated/prisma/client';
import type { Event as EventRow } from '../generated/prisma/client';
import { CreateEventDto } from './dto/create-event.dto';
import { EventListQueryDto, type EventState } from './dto/event-list-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';

// The API shape of one event. Dates are inclusive yyyy-mm-dd calendar days;
// state is derived from them against today at read time (AC3), never stored.
// The owner is a live join, not a snapshot: unlike a notification payload,
// an event cannot outlive its owner (cascade), so the name cannot go stale
// into nonsense. `joined` is the caller's own participation, which is what
// the list page needs to label each card's Join/Leave button (RUN-68)
// without a per-event follow-up call. `mine` answers "am I the owner" the
// same way: the device-session frontend (see frontend session.ts) does not
// track its own user id, and comparing owner.id client-side would force it
// to - the API knows the caller, so it says so directly.
export interface EventResponse {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  targetKm: number | null;
  state: EventState;
  participantCount: number;
  joined: boolean;
  mine: boolean;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

export interface EventListResponse {
  items: EventResponse[];
  total: number;
  page: number;
  pageSize: number;
}

// One participant of one event, carrying both things RUN-69's detail page
// renders: the membership itself (the participant list, AC1) and that
// runner's standing inside the event window (the leaderboard, AC2). They
// travel together because they are the same set of people counted two
// ways - splitting them into two endpoints would double the round trips to
// answer one screen, and the ranks have to be global anyway.
//
// The three nullable fields are one decision, not three: `rank` is null
// exactly when the runner is off leaderboards (AC3), and their distance and
// run count go with it. Withholding the numbers rather than sending them
// with a "do not display" flag is what makes the opt-out real - a client
// cannot render what it never received - and it also keeps the API from
// naming another user's privacy setting back at the caller.
export interface EventParticipantResponse {
  id: string;
  firstName: string;
  lastName: string;
  joinedAt: string;
  me: boolean;
  rank: number | null;
  totalKm: number | null;
  runCount: number | null;
}

// Deliberately not paginated, unlike every other list in this API: a
// leaderboard is only correct as a whole. Offset pages would rank within a
// page (or force the client to walk every page before it can render a
// single row), and the set is bounded by one event's membership rather than
// by the whole database. `total` therefore equals items.length today; it is
// here so a future page window can be added without changing the envelope's
// shape.
export interface EventParticipantListResponse {
  items: EventParticipantResponse[];
  total: number;
}

// Join and leave answer the full updated EventResponse rather than a
// follow-style state stub (review fix): the card that clicked needs the
// flipped flag AND the fresh participant count, and answering both here
// replaces a second authenticated round-trip (a GET that could fail AFTER
// the membership already changed, leaving the UI contradicting the server)
// with one cheap read inside the same request.

// RUN-69 AC2's ranking, pure so it can be tested without a database. Only
// opted-in runners are ranked (AC3), and the ranking is the competition
// kind: equal distances share a place and the next distinct distance skips
// the places they consumed (1, 1, 3). The id tiebreak only fixes the sort's
// order among tied rows - they get the same rank either way - so the output
// is deterministic rather than dependent on the sort's stability.
export function rankByDistance(
  rows: Array<{ id: string; totalKm: number; showOnLeaderboard: boolean }>,
): Map<string, number> {
  const contenders = rows
    // The opt-in gate itself lives in common/privacy.ts since RUN-64, so
    // this leaderboard and the global one read the same rule.
    .filter((row) => appearsOnLeaderboard(row))
    .sort((a, b) => b.totalKm - a.totalKm || a.id.localeCompare(b.id));

  const ranks = new Map<string, number>();
  let previousKm: number | null = null;
  let previousRank = 0;
  contenders.forEach((row, index) => {
    const rank = row.totalKm === previousKm ? previousRank : index + 1;
    ranks.set(row.id, rank);
    previousKm = row.totalKm;
    previousRank = rank;
  });
  return ranks;
}

// Distances are Floats, so summing them accumulates binary-fraction noise
// (0.1 + 0.2 = 0.30000000000000004), which would both print as
// 30.000000000000004 km and order two genuinely equal totals.
//
// One decimal, not two (review fix): the app renders distances to one
// decimal everywhere (frontend formatKm), so ranking on a finer number
// than the one on screen produces a leaderboard that reads as a bug -
// 12.34 km above 12.29 km, both printed "12.3 km". Rounding here makes the
// order and the rendered number agree, and two runners the UI shows as
// equal genuinely tie.
function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

// AC3's lifecycle, on inclusive dates: the event is active on its start and
// end days themselves. ISO day strings compare chronologically as strings.
export function deriveEventState(
  startDate: string,
  endDate: string,
  today: string,
): EventState {
  if (today < startDate) return 'upcoming';
  if (today > endDate) return 'finished';
  return 'active';
}

// What every read includes beyond the row: the owner's name for the card
// header, the participant count (AC3), and whether the CALLER is among the
// participants - fetched as a where-filtered include so the page never loads
// the full participant list to answer a boolean.
function eventInclude(userId: string) {
  return {
    owner: { select: { id: true, firstName: true, lastName: true } },
    _count: { select: { participants: true } },
    participants: { where: { userId }, select: { id: true } },
  };
}

type EventWithMeta = EventRow & {
  owner: { id: string; firstName: string; lastName: string };
  _count: { participants: number };
  participants: Array<{ id: string }>;
};

// The two FK constraints a join insert can violate, disambiguated by name
// exactly like follow.service does for Follow's two User FKs.
const PARTICIPANT_USER_FKEY = 'EventParticipant_userId_fkey';
const PARTICIPANT_EVENT_FKEY = 'EventParticipant_eventId_fkey';

// Community events (RUN-67). Every method takes the verified caller's id
// first, like every service since RUN-57. Events are readable and joinable
// by any signed-in user; only mutations of the event itself are scoped to
// the owner, folded into the WHERE clause so a non-owner's PATCH/DELETE is
// indistinguishable from a nonexistent id (404, AC5).
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // AC1: the creator becomes owner and first participant in one nested
  // create - a single atomic statement, so no crash can leave an event whose
  // own owner is not in it.
  async create(userId: string, dto: CreateEventDto): Promise<EventResponse> {
    this.assertDateOrder(dto.startDate, dto.endDate);
    try {
      const row = await this.prisma.event.create({
        data: {
          name: dto.name,
          description: dto.description ?? '',
          startDate: toDbDate(dto.startDate),
          endDate: toDbDate(dto.endDate),
          targetKm: dto.targetKm ?? null,
          ownerId: userId,
          participants: { create: { userId } },
        },
        include: eventInclude(userId),
      });
      return this.toResponse(row, utcTodayIso(), userId);
    } catch (error) {
      // Both FKs in the nested create carry the caller's id, so any P2003
      // here means the token's account was deleted mid-session.
      if (isPrismaError(error, 'P2003')) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      throw error;
    }
  }

  // AC3: chronological (soonest start first), with the count and derived
  // state per event, optionally narrowed to one state. Today is captured
  // once so the filter and every derived state agree even when the request
  // straddles midnight.
  async list(
    userId: string,
    query: EventListQueryDto,
  ): Promise<EventListResponse> {
    const { page, pageSize, skip } = resolvePagination(query);
    const today = utcTodayIso();
    const where = this.stateFilter(query.state, today);

    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.event.findMany({
          where,
          orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
          skip,
          take: pageSize,
          include: eventInclude(userId),
        }),
        this.prisma.event.count({ where }),
      ],
      // One snapshot for both, so items and total cannot disagree inside a
      // single response (same reasoning as the notifications list).
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      items: rows.map((row) => this.toResponse(row, today, userId)),
      total,
      page,
      pageSize,
    };
  }

  // Any signed-in user reads any event: events are public within the app
  // (that is what makes them joinable), so this 404s only on a genuinely
  // unknown id. RUN-69's detail page reads through this.
  async findOne(userId: string, id: string): Promise<EventResponse> {
    const row = await this.prisma.event.findUnique({
      where: { id },
      include: eventInclude(userId),
    });
    if (!row) throw new NotFoundException(`Event ${id} not found`);
    return this.toResponse(row, utcTodayIso(), userId);
  }

  // RUN-69 AC1 + AC2: everyone who joined this event, each with their
  // standing inside the event's own date window. Readable by any signed-in
  // user, like the event itself.
  //
  // Three reads, exactly one of them the aggregation the ticket asks for
  // (AC6): the event (for the window, and the 404 on an unknown id), its
  // participants, and one GROUP BY over the runs of those participants
  // inside the window. Prisma's groupBy compiles to that single SQL
  // aggregation, which is why there is no raw query here: the same one
  // statement, but type-checked and injection-free.
  //
  // Both dates are inclusive, so the window is a closed interval and a run
  // logged on the first or the last day counts (the same rule the event's
  // own state derivation uses). The DATE column stores midnight UTC, so
  // gte/lte on the day boundaries needs no time-of-day slack.
  async listParticipants(
    userId: string,
    eventId: string,
  ): Promise<EventParticipantListResponse> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { startDate: true, endDate: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const participants = await this.prisma.eventParticipant.findMany({
      where: { eventId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        createdAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            showOnLeaderboard: true,
          },
        },
      },
    });
    if (participants.length === 0) return { items: [], total: 0 };

    // The aggregation, narrowed to the participants themselves: a global
    // GROUP BY over every run in the window would scan strangers' rows to
    // throw them away.
    const totals = await this.prisma.run.groupBy({
      by: ['userId'],
      where: {
        userId: { in: participants.map((row) => row.user.id) },
        date: { gte: event.startDate, lte: event.endDate },
      },
      _sum: { distanceKm: true },
      _count: { _all: true },
    });
    const byUser = new Map(totals.map((row) => [row.userId, row]));

    // Ranked across every participant, not within some page or the
    // opted-in subset's own arrival order: a rank means "your place among
    // everyone competing here".
    const ranks = rankByDistance(
      participants.map((row) => ({
        id: row.user.id,
        showOnLeaderboard: row.user.showOnLeaderboard,
        totalKm: roundKm(byUser.get(row.user.id)?._sum.distanceKm ?? 0),
      })),
    );

    const items = participants.map((row) => {
      const rank = ranks.get(row.user.id) ?? null;
      const aggregate = byUser.get(row.user.id);
      return {
        id: row.user.id,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
        joinedAt: row.createdAt.toISOString(),
        me: row.user.id === userId,
        // Opted out: no place, and none of the numbers that would let a
        // client reconstruct one (AC3).
        rank,
        totalKm:
          rank === null ? null : roundKm(aggregate?._sum.distanceKm ?? 0),
        runCount: rank === null ? null : (aggregate?._count._all ?? 0),
      };
    });

    return { items, total: items.length };
  }

  // AC2 + AC4: ensures the caller participates, then answers the updated
  // event. Idempotent by way of the unique (eventId, userId) pair: the
  // repeat POST hits P2002 and reports the same final state - aborting the
  // transaction BEFORE the notification write, so the owner is notified
  // exactly once per genuine join. The owner "joining" their own event
  // lands on the same P2002 (they participate since creation) and notifies
  // nobody.
  async join(userId: string, eventId: string): Promise<EventResponse> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Read inside the transaction: the row's FK check on the insert
        // below keeps this lookup honest (an event deleted mid-transaction
        // surfaces as P2003, mapped to the same 404).
        const event = await tx.event.findUnique({
          where: { id: eventId },
          select: { ownerId: true, name: true },
        });
        if (!event) throw new NotFoundException(`Event ${eventId} not found`);

        await tx.eventParticipant.create({ data: { eventId, userId } });
        if (event.ownerId !== userId) {
          await this.notifications.recordEventJoined(
            tx,
            event.ownerId,
            userId,
            {
              id: eventId,
              name: event.name,
            },
          );
        }
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        // Already in: the state the caller asked for already holds; fall
        // through to answering the current event.
      } else if (isPrismaError(error, 'P2003')) {
        throw await this.mapJoinForeignKeyError(error, userId, eventId);
      } else {
        throw error;
      }
    }
    // One extra read in the same request. The window between the insert and
    // this read is real but benign: a deletion in it turns the answer into
    // the same 404 the caller would get a moment later anyway.
    return this.findOne(userId, eventId);
  }

  // AC2: ensures the caller does not participate, except the owner, whose
  // membership is structural (AC1 made them the first participant) - leaving
  // would orphan the event's own creator, so that is a 400, not a no-op.
  // Leaving an event never joined or already left is idempotent and answers
  // the same updated event; an unknown event is a 404 (review fix: this was
  // a silent 204, but with the response carrying the updated event there is
  // nothing truthful to answer for a row that does not exist).
  async leave(userId: string, eventId: string): Promise<EventResponse> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { ownerId: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);
    if (event.ownerId === userId) {
      throw new BadRequestException('The owner cannot leave their own event');
    }
    await this.prisma.eventParticipant.deleteMany({
      where: { eventId, userId },
    });
    return this.findOne(userId, eventId);
  }

  // AC5: owner-scoped update. The read and the write both fold ownerId into
  // the WHERE, so a non-owner (or an unknown id) is a 404 at either step and
  // an id never confirms an event exists for someone else.
  async update(
    userId: string,
    id: string,
    dto: UpdateEventDto,
  ): Promise<EventResponse> {
    // The pre-read exists for the merged date-order check below (plus the
    // ownership 404), so it fetches exactly the two dates; the full
    // include-shaped row is paid for once, by whichever branch answers.
    const existing = await this.prisma.event.findFirst({
      where: { id, ownerId: userId },
      select: { startDate: true, endDate: true },
    });
    if (!existing) throw new NotFoundException(`Event ${id} not found`);

    // The order rule holds on the MERGED pair: a PATCH moving only one date
    // must not slide it past the other stored one.
    this.assertDateOrder(
      dto.startDate ?? toIsoDate(existing.startDate),
      dto.endDate ?? toIsoDate(existing.endDate),
    );

    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.startDate !== undefined && {
        startDate: toDbDate(dto.startDate),
      }),
      ...(dto.endDate !== undefined && { endDate: toDbDate(dto.endDate) }),
      // null clears the goal; undefined keeps it (see UpdateEventDto).
      ...(dto.targetKm !== undefined && { targetKm: dto.targetKm }),
    };

    // An empty PATCH is a deliberate no-op, answered like a plain read (the
    // runs update sets this precedent); the scoped pre-read above already
    // proved the caller owns the row, so the any-user findOne is safe here.
    if (Object.keys(data).length === 0) {
      return this.findOne(userId, id);
    }

    try {
      // WhereUniqueInput carries the owner alongside the id, so an event
      // deleted between the read and this write is a P2025, mapped to the
      // same 404 as any miss - never a write to a row that stopped being
      // the caller's.
      const row = await this.prisma.event.update({
        where: { id, ownerId: userId },
        data,
        include: eventInclude(userId),
      });
      return this.toResponse(row, utcTodayIso(), userId);
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException(`Event ${id} not found`);
      }
      throw error;
    }
  }

  // AC5: owner-scoped delete; participants go with it via the schema-level
  // cascade. Notifications already delivered survive by design: their
  // payloads are snapshots (RUN-65 AC4).
  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.event.deleteMany({
      where: { id, ownerId: userId },
    });
    if (result.count === 0)
      throw new NotFoundException(`Event ${id} not found`);
  }

  // AC1's cross-field rule, shared by create and the merged PATCH pair. ISO
  // day strings compare chronologically as strings; both fields' own
  // validators already guaranteed real days by the time this runs.
  private assertDateOrder(startDate: string, endDate: string): void {
    if (endDate < startDate) {
      throw new BadRequestException('endDate must not be before startDate');
    }
  }

  // AC3's filter as a WHERE clause, the exact complement partition of
  // deriveEventState: every event matches exactly one state's range.
  private stateFilter(
    state: EventState | undefined,
    todayIso: string,
  ): Prisma.EventWhereInput {
    if (!state) return {};
    const today = toDbDate(todayIso);
    if (state === 'upcoming') return { startDate: { gt: today } };
    if (state === 'finished') return { endDate: { lt: today } };
    return { startDate: { lte: today }, endDate: { gte: today } };
  }

  // A P2003 from the join insert means one of its two FKs had no row; the
  // named constraint tells which. The user side is the caller - a verified
  // token whose account was deleted mid-session - answered like any dead
  // session; the event side is a join of an event deleted mid-request: 404,
  // same shape as the not-found read. The fallback without a constraint
  // name checks the caller first, exactly like follow.service (the
  // reasoning lives there).
  private async mapJoinForeignKeyError(
    error: unknown,
    userId: string,
    eventId: string,
  ): Promise<Error> {
    const constraint = prismaConstraint(error);
    if (constraint === PARTICIPANT_USER_FKEY) {
      return new UnauthorizedException('Invalid or expired token');
    }
    if (constraint === PARTICIPANT_EVENT_FKEY) {
      return new NotFoundException(`Event ${eventId} not found`);
    }

    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!caller) return new UnauthorizedException('Invalid or expired token');
    return new NotFoundException(`Event ${eventId} not found`);
  }

  private toResponse(
    row: EventWithMeta,
    today: string,
    userId: string,
  ): EventResponse {
    const startDate = toIsoDate(row.startDate);
    const endDate = toIsoDate(row.endDate);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      startDate,
      endDate,
      targetKm: row.targetKm,
      state: deriveEventState(startDate, endDate, today),
      participantCount: row._count.participants,
      joined: row.participants.length > 0,
      mine: row.ownerId === userId,
      owner: row.owner,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
