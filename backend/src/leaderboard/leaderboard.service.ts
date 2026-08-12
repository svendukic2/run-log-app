import { Injectable } from '@nestjs/common';
import { addDaysIso, mondayOf, toDbDate, utcTodayIso } from '../common/dates';
import { rankByDistance, roundKm } from '../common/ranking';
import { outlierUserIds } from '../common/runLimits';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';

// One runner's standing in one week. Unlike the event board's row, nothing
// here is nullable: an opted-out runner is not a row with withheld numbers,
// they are simply absent (the global board has no membership list to appear
// on). `me` marks the caller's own row so the page can highlight it without
// the device-session frontend tracking its own user id.
export interface LeaderboardRow {
  id: string;
  firstName: string;
  lastName: string;
  rank: number;
  totalKm: number;
  runCount: number;
  me: boolean;
  // RUN-72: at least one of the runs behind this total is legal but
  // extreme (see common/runLimits.ts). The page draws a subtle marker for
  // it. False is the ordinary case, so an opted-out runner - who is not a
  // row here at all - leaks nothing by their absence.
  unverified: boolean;
}

// The window is echoed back because the request may omit it (current week)
// or name any day inside it, so the client never has to guess which week it
// is looking at.
//
// `me` is the caller's own row, repeated outside `items` on purpose: the
// page pins it even when the caller ranks far below the served window
// (AC2), and repeating it there costs one row instead of a second request.
// It is null exactly when the caller is off leaderboards (AC3) - the one
// signal the banner needs, and one that names nobody else's setting.
//
// `total` is how many runners are ranked in the whole week, so the page can
// say "showing the top N of M" honestly.
export interface LeaderboardResponse {
  weekStart: string;
  weekEnd: string;
  items: LeaderboardRow[];
  me: LeaderboardRow | null;
  total: number;
}

// How many rows the board serves. The ranking itself is computed over every
// opted-in runner - a rank means "your place among everyone", not "among
// the rows you were sent" - and only the served slice is cut here, with the
// caller's own row travelling separately. Bounded because this list grows
// with the whole user base rather than with one event's membership.
export const LEADERBOARD_LIMIT = 50;

// The global weekly leaderboard (RUN-70): total distance per runner inside
// one Monday-Sunday week, ranked, for runners who opted in.
@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  // Two reads, exactly one of them the aggregation the ticket asks for
  // (AC6): the opted-in runners (for their names, and so runners who sat
  // the week out still get a row), then one GROUP BY over the week's runs.
  // Prisma's groupBy compiles to that single SQL aggregation, which is why
  // there is no raw query here - the same one statement, type checked and
  // injection free, and no per-user follow-up.
  //
  // The opt-in gate is expressed INSIDE the aggregation as a relation
  // filter rather than as an id list built from the first read (review
  // fix): an `IN` list carries one bind parameter per opted-in account, so
  // it turns into a hard failure past Postgres' 65535-parameter cap
  // instead of merely a slow query. The event board can pass ids because
  // one event's membership is bounded; the global board is bounded only by
  // the user table.
  async weeklyBoard(
    userId: string,
    query: LeaderboardQueryDto,
  ): Promise<LeaderboardResponse> {
    // Weeks are Monday-Sunday inclusive and identified by their Monday,
    // the same definition the dashboard uses (frontend startOfWeek, server
    // mondayOf). Any day inside the week resolves to the same window.
    const weekStart = mondayOf(query.weekStart ?? utcTodayIso());
    const weekEnd = addDaysIso(weekStart, 6);

    const candidates = await this.prisma.user.findMany({
      where: { showOnLeaderboard: true },
      select: { id: true, firstName: true, lastName: true },
    });
    if (candidates.length === 0) {
      return { weekStart, weekEnd, items: [], me: null, total: 0 };
    }

    const totals = await this.prisma.run.groupBy({
      by: ['userId'],
      where: {
        user: { showOnLeaderboard: true },
        // The DATE column stores midnight UTC, so gte/lte on the two day
        // boundaries is the closed interval with no time-of-day slack.
        date: { gte: toDbDate(weekStart), lte: toDbDate(weekEnd) },
      },
      _sum: { distanceKm: true },
      _count: { _all: true },
    });
    const byUser = new Map(totals.map((row) => [row.userId, row]));

    // The outlier marker (RUN-72 AC2) is a fact about a single RUN, so it
    // cannot come out of the aggregation above: a week totalling 80 km is a
    // good week, one 80 km run is the unusual thing. Hence a second read of
    // the same window, selecting three columns and no more.
    //
    // It is a read rather than a smarter WHERE because the pace rule
    // compares two columns arithmetically (durationSeconds < 210 *
    // distanceKm), which Prisma's filters cannot express without dropping
    // to raw SQL - and a raw query here would buy one scan at the cost of
    // the type checking every other query in this service has. The gate is
    // the same relation filter, so a runner who is off leaderboards is
    // never even read.
    const weekRuns = await this.prisma.run.findMany({
      where: {
        user: { showOnLeaderboard: true },
        date: { gte: toDbDate(weekStart), lte: toDbDate(weekEnd) },
      },
      select: { userId: true, distanceKm: true, durationSeconds: true },
    });
    const flagged = outlierUserIds(weekRuns);

    // Everyone opted in is ranked, including runners with no runs this
    // week: they tie at 0 km at the bottom, which is what makes a pinned
    // "you" row (AC2) truthful in a week the caller sat out instead of
    // silently vanishing from their own leaderboard.
    const ranks = rankByDistance(
      candidates.map((row) => ({
        id: row.id,
        showOnLeaderboard: true,
        totalKm: roundKm(byUser.get(row.id)?._sum.distanceKm ?? 0),
      })),
    );

    const rows = candidates
      .map((row) => {
        const aggregate = byUser.get(row.id);
        return {
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          // Every candidate is opted in, so rankByDistance ranked all of
          // them; the fallback only satisfies the Map's type.
          rank: ranks.get(row.id) ?? 0,
          totalKm: roundKm(aggregate?._sum.distanceKm ?? 0),
          runCount: aggregate?._count._all ?? 0,
          me: row.id === userId,
          unverified: flagged.has(row.id),
        };
      })
      // Tied rows share a rank, so the id decides only which of them is
      // drawn first - the same deterministic tiebreak the ranking uses.
      .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

    return {
      weekStart,
      weekEnd,
      items: rows.slice(0, LEADERBOARD_LIMIT),
      me: rows.find((row) => row.me) ?? null,
      total: rows.length,
    };
  }
}
