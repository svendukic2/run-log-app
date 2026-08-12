import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { toDbDate, toIsoDate, utcTodayIso } from '../common/dates';
import { kmNumber, toMeasuredRuns } from '../common/decimal';
import { resolvePagination } from '../common/pagination-query.dto';
import { rankByDistance, roundKm } from '../common/ranking';
import { outlierUserIds } from '../common/runLimits';
import { NotificationsService } from '../notifications/notifications.service';
import { isPrismaError, prismaConstraint } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
// The shared newest-first ordering, imported rather than retyped so the event's
// run feed arrives in the same order as every other run list (the users module
// imports from here for the same reason).
import { runsNewestFirstOrder } from '../runs/run-response';
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
// The four nullable fields are one decision, not four: `rank` is null
// exactly when the runner is off leaderboards (AC3), and their distance,
// run count and outlier flag go with it. Withholding the numbers rather
// than sending them with a "do not display" flag is what makes the opt-out
// real - a client cannot render what it never received - and it also keeps
// the API from naming another user's privacy setting back at the caller.
//
// `unverified` joined that family in RUN-72 rather than defaulting to
// false for an unranked row: it is derived from that runner's runs, so it
// is one of the numbers the opt-out withholds, not a decoration on top of
// them.
export interface EventParticipantResponse {
  id: string;
  firstName: string;
  lastName: string;
  joinedAt: string;
  me: boolean;
  rank: number | null;
  totalKm: number | null;
  runCount: number | null;
  unverified: boolean | null;
}

// One run tagged to this event (RUN-76 AC2), as the event page's run feed
// lists it: who ran it, when, and the two numbers. The runner is a live join
// like the event's owner - an event's tagged runs cannot outlive their runner
// (Run cascades with User), so there is nothing to snapshot.
//
// No route and no note: this is a feed of other people's runs, and the route
// especially is gated by a privacy setting this endpoint does not read
// (User.showRoutes, RUN-55). Adding either means answering that question
// first, which is exactly why neither is here by accident.
export interface EventRunResponse {
  id: string;
  date: string;
  distanceKm: number;
  durationSeconds: number;
  runner: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface EventRunListResponse {
  items: EventRunResponse[];
  total: number;
}

// One event the caller may tag a run to (RUN-76 AC1). Narrow on purpose: the
// picker needs a label, and the window is there so the form can explain WHY a
// given event is or is not on the list. Everything else an EventResponse
// carries - the participant count, the derived state, the owner - would be
// joins paid for on every keystroke in a date field.
export interface TaggableEventResponse {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface TaggableEventListResponse {
  items: TaggableEventResponse[];
  total: number;
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

// The ranking itself (RUN-69 AC2) and the one-decimal rounding it depends
// on moved to common/ranking.ts in RUN-70, where the global weekly board
// reads exactly the same rules; they are imported above.

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
  // (AC6): the event (for the 404 on an unknown id), its participants, and one
  // GROUP BY over the runs TAGGED to this event. Prisma's groupBy compiles to
  // that single SQL aggregation, which is why there is no raw query here: the
  // same one statement, but type-checked and injection-free.
  //
  // RUN-76 changed what "counts" means here, and it is worth being explicit
  // because it is a behaviour change rather than a refactor. This used to sum
  // every run of every participant whose DATE fell inside the event window, so
  // joining silently enrolled all of your running and there was no way to say
  // "this run was for the event, that one was not". Now a run counts when it
  // carries this event's id, full stop. The window has not stopped mattering -
  // it is checked when the tag is WRITTEN (runs.service assertTaggable), which
  // is the one place it can be checked against the run's own date - so an
  // eventId here already implies a date inside the window and filtering on both
  // would be the same query twice.
  async listParticipants(
    userId: string,
    eventId: string,
  ): Promise<EventParticipantListResponse> {
    // Read for the 404 alone now that the aggregation below needs no window.
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
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
        eventId,
      },
      _sum: { distanceKm: true },
      _count: { _all: true },
    });
    const byUser = new Map(totals.map((row) => [row.userId, row]));

    // The outlier marker (RUN-72 AC2), read exactly the way the global
    // board reads it: per RUN, because one 80 km run is unusual while a
    // set of runs totalling 80 km is not, and as its own small select
    // because the pace rule compares two columns arithmetically and no
    // Prisma filter can express that without raw SQL.
    //
    // Narrowed to the participants who are ON the board: an opted-out
    // runner's runs are never read here, so there is nothing to withhold
    // later by accident.
    const rankedIds = participants
      .filter((row) => row.user.showOnLeaderboard)
      .map((row) => row.user.id);
    // toMeasuredRuns is the Decimal boundary (RUN-78), for the same reason
    // the global board applies it: the outlier rules compare plain numbers,
    // and a Decimal against a threshold is false every time.
    const taggedRuns = rankedIds.length
      ? toMeasuredRuns(
          await this.prisma.run.findMany({
            where: { userId: { in: rankedIds }, eventId },
            select: { userId: true, distanceKm: true, durationSeconds: true },
          }),
        )
      : [];
    const flagged = outlierUserIds(taggedRuns);

    // Ranked across every participant, not within some page or the
    // opted-in subset's own arrival order: a rank means "your place among
    // everyone competing here".
    const ranks = rankByDistance(
      participants.map((row) => ({
        id: row.user.id,
        showOnLeaderboard: row.user.showOnLeaderboard,
        totalKm: roundKm(kmNumber(byUser.get(row.user.id)?._sum.distanceKm)),
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
          rank === null ? null : roundKm(kmNumber(aggregate?._sum.distanceKm)),
        runCount: rank === null ? null : (aggregate?._count._all ?? 0),
        unverified: rank === null ? null : flagged.has(row.user.id),
      };
    });

    return { items, total: items.length };
  }

  // RUN-76 AC2: the runs tagged to this event, newest first, each with its
  // runner. Readable by any signed-in user, like the event and its
  // participants - what an event publishes is what its members put in it.
  //
  // ONE privacy rule, and it is not optional: a run is in this feed only if its
  // runner is on leaderboards, or if it is the caller's own. Without that, this
  // endpoint would quietly undo the leaderboard opt-out the card next to it
  // honours - summing an opted-out runner's rows here rebuilds exactly the
  // totalKm and runCount that listParticipants withholds from them. The opt-out
  // is about the numbers, not about one particular list of them.
  //
  // Not paginated, for the leaderboard's reason and with the leaderboard's
  // envelope: the set is bounded by one event's tagged runs rather than by the
  // database, and `total` is here so a page window can be added later without
  // reshaping the response.
  async listRuns(
    userId: string,
    eventId: string,
  ): Promise<EventRunListResponse> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const rows = await this.prisma.run.findMany({
      where: {
        eventId,
        // Still a participant, and this is not belt-and-braces: leaving an event
        // does not untag the runs you tagged to it, so without this a runner who
        // joined, tagged a run and left would stay in the feed while the
        // leaderboard beside it (which reads through the participant list)
        // dropped them. Two cards on one page disagreeing about who is in the
        // event is worse than either answer alone (review finding).
        user: { eventParticipations: { some: { eventId } } },
        OR: [{ user: { showOnLeaderboard: true } }, { userId }],
      },
      // The same order every run list in this app uses, imported rather than
      // retyped (run-response.ts explains the id tiebreak).
      orderBy: [...runsNewestFirstOrder],
      select: {
        id: true,
        date: true,
        distanceKm: true,
        durationSeconds: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const items = rows.map((row) => ({
      id: row.id,
      date: toIsoDate(row.date),
      // The Decimal boundary (RUN-78), on a feed RUN-76 added in parallel:
      // this response is served straight to a browser, so the decimal.js
      // object has to become a plain number here like it does in every other
      // mapper. Listed in common/decimal.ts with the rest.
      distanceKm: kmNumber(row.distanceKm),
      durationSeconds: row.durationSeconds,
      runner: row.user,
    }));
    return { items, total: items.length };
  }

  // RUN-76 AC1: the events the caller may tag a run of this date to, which is
  // exactly the set runs.service's assertTaggable accepts - joined by the
  // caller, and containing the date. Stated as one query in one place so the
  // form cannot offer an option the write path then rejects; if these two ever
  // disagree, this is the half that is wrong, because the other one is the
  // enforcement.
  //
  // A caller who has joined nothing, or nothing covering that day, gets an
  // empty list rather than an error: "no event" is a perfectly ordinary answer
  // and the form's own "No event" option is always there.
  async listTaggableEvents(
    userId: string,
    dateIso: string,
  ): Promise<TaggableEventListResponse> {
    const date = toDbDate(dateIso);
    const rows = await this.prisma.event.findMany({
      where: {
        participants: { some: { userId } },
        // Inclusive both ends, the closed interval the whole module uses.
        startDate: { lte: date },
        endDate: { gte: date },
      },
      // The list's own chronological order, so a picker with two overlapping
      // events lists them the way every other event surface does.
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, startDate: true, endDate: true },
    });

    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      startDate: toIsoDate(row.startDate),
      endDate: toIsoDate(row.endDate),
    }));
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

    // Moving the window can leave tagged runs outside it, and since RUN-76 the
    // leaderboard trusts that it cannot: it aggregates by eventId alone, on the
    // grounds that the window was checked when the tag was written. So the check
    // is re-applied here, on the only other write that can break it - the runs
    // that fall outside the NEW window are untagged (review finding).
    //
    // Untagging rather than refusing the edit: the owner's window is theirs to
    // change, and a date they no longer count is not a run anyone needs to lose.
    // It also keeps those runs editable - the run form always submits its whole
    // shape, so a run left tagged to an event that no longer covers it would be
    // a 400 on every subsequent save.
    const movesWindow =
      dto.startDate !== undefined || dto.endDate !== undefined;

    try {
      // WhereUniqueInput carries the owner alongside the id, so an event
      // deleted between the read and this write is a P2025, mapped to the
      // same 404 as any miss - never a write to a row that stopped being
      // the caller's.
      const row = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.event.update({
          where: { id, ownerId: userId },
          data,
          include: eventInclude(userId),
        });
        if (movesWindow) {
          await tx.run.updateMany({
            where: {
              eventId: id,
              OR: [
                { date: { lt: updated.startDate } },
                { date: { gt: updated.endDate } },
              ],
            },
            data: { eventId: null },
          });
        }
        return updated;
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
