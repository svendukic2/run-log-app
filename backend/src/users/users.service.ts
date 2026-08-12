import { Injectable, NotFoundException } from '@nestjs/common';
import { resolvePagination } from '../common/pagination-query.dto';
import { canViewProfile, routeVisibility } from '../common/privacy';
import { PrismaService } from '../prisma/prisma.service';
import {
  runsNewestFirstOrder,
  toRunResponse,
  type RunResponse,
} from '../runs/run-response';
import { searchTerms, type UserSearchQueryDto } from './user-search-query.dto';

// One runner's public profile, as RUN-63's /people/:id page reads it.
//
// The shape is split in two on purpose, and the split IS the privacy rule:
// everything above `visible` is the header, always served (AC2 wants the
// name, the counts and a working follow button on a private profile too);
// everything below it is the body, and a private profile simply does not
// carry it. `runs: null` is not "no runs" - it is "not yours to see", which
// is why an empty public log serves `[]` instead.
//
// Records and the weekly distance chart are derived from these runs by the
// same frontend helpers the dashboard uses (deriveRecords, distanceForDay),
// so they are not separate fields: one gated list feeds all three cards and
// there is no second place for the gate to be forgotten.
export interface PublicProfileResponse {
  id: string;
  firstName: string;
  lastName: string;
  // Whether the viewer is looking at their own profile (AC3): the client
  // does not track its own user id, so the API answers the question, the
  // same call the events list makes with `mine`.
  me: boolean;
  // Whether the viewer follows this runner, for the header's follow button.
  following: boolean;
  // Both directions, like the follow list envelope, so one call renders the
  // whole header.
  counts: { followers: number; following: number };
  // Whether the body below was served. False means gated, never "empty".
  visible: boolean;
  // Whether route maps may be rendered for these runs. Since RUN-54 there is
  // real route data behind this, so it is BOTH a permission and a promise
  // about the payload: when it is false, every run below arrives with
  // `route: null` regardless of what is stored. When it is true and the
  // viewer is not the owner, the routes that DO arrive are trimmed - each
  // one says so on itself (`route.trimmed`), because a route short enough to
  // vanish under the trim still arrives as null on an otherwise routed run.
  showRoutes: boolean;
  runs: RunResponse[] | null;
}

// One row of GET /api/users?search= (RUN-62): who they are, and whether the
// caller already follows them so the row's button renders in the right
// state from the first paint.
//
// Name and id only, deliberately. A search row is served for PRIVATE
// accounts too - their profile page still renders a header and a working
// follow button (RUN-63 AC2), so hiding them from search would only make
// them unfollowable - which is exactly why nothing here may grow into run
// counts, distances or anything else a private account has not shared.
export interface FoundUser {
  id: string;
  firstName: string;
  lastName: string;
  following: boolean;
}

// The search envelope. `counts` is the caller's OWN follow counts, carried
// on every answer including the empty-query one, because the People page
// shows them beside the search box whether or not anything was typed.
export interface UserSearchResponse {
  items: FoundUser[];
  total: number;
  page: number;
  pageSize: number;
  counts: { followers: number; following: number };
}

// What a search row is allowed to project, written down once next to the
// profile's select and for the same reason: this runs against the User row,
// which also holds passwordHash and email.
const USER_SEARCH_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
} as const;

// Alphabetical, with the id as the tiebreak that makes the order total:
// two runners with the same name must not swap places between page 1 and
// page 2. Newest-first (the follow lists' order) would be meaningless here
// - nobody scans search results by signup date.
const USER_SEARCH_ORDER = [
  { firstName: 'asc' },
  { lastName: 'asc' },
  { id: 'asc' },
] as const;

// The columns the profile read projects. Named like PRIVACY_SELECT next
// door and for the same reason: this select runs against the User row,
// which also holds passwordHash and email, so it is written down once
// rather than inlined where it can quietly grow.
const PUBLIC_PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  profilePublic: true,
  showRoutes: true,
} as const;

// Reads of OTHER accounts (RUN-63). The first service in the app that
// serves one user's data to another, so every method takes the viewer's id
// first - not to scope the query to them (this is deliberately a foreign
// read) but to decide what the answer may contain.
//
// RUN-62 extends this module with GET /api/users?search=; the search will
// live beside findPublicProfile and reuse the same privacy helpers.
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublicProfile(
    viewerId: string,
    id: string,
  ): Promise<PublicProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_PROFILE_SELECT,
    });
    // Only a genuinely unknown id is a 404. A private account answers 200
    // because there is still a header it is entitled to serve (AC2 wants
    // the name, the counts and a working follow button), and 403 is simply
    // the wrong status for "you may read the header but not the body".
    //
    // Being honest about the consequence, since the reviewer caught the
    // earlier comment claiming the opposite: 404-for-unknown next to
    // 200-for-private IS an id enumeration oracle, and a 403 would have
    // revealed less. That is an accepted tradeoff, not a property this code
    // has - the mitigation is that ids are cuid(), so there is no id space
    // to walk in the first place.
    if (!user) throw new NotFoundException(`User ${id} not found`);

    const me = viewerId === id;
    const visible = canViewProfile(user, viewerId, id);

    // Independent reads, so they run together rather than in sequence. The
    // gated case never queries the runs at all - the body is not fetched
    // and then dropped, it is never read, which is the difference between a
    // gate and a filter someone can forget.
    const [followers, following, edge, runs] = await Promise.all([
      this.prisma.follow.count({ where: { followeeId: id } }),
      this.prisma.follow.count({ where: { followerId: id } }),
      me
        ? Promise.resolve(null)
        : this.prisma.follow.findUnique({
            where: {
              followerId_followeeId: { followerId: viewerId, followeeId: id },
            },
            select: { id: true },
          }),
      visible
        ? this.prisma.run.findMany({
            where: { userId: id },
            orderBy: [...runsNewestFirstOrder],
          })
        : Promise.resolve(null),
    ]);

    // Computed once and used twice on purpose: the flag the page reads and
    // the gate the payload is built with have to be the same answer, or the
    // profile would advertise routes it did not send (or worse, the reverse).
    // 'trimmed' is what a granted stranger gets since RUN-55 - the route
    // without its first and last ~300 m, so a shared run does not carry the
    // runner's front door with it.
    const visibility = routeVisibility(user, viewerId, id);

    return {
      id,
      firstName: user.firstName,
      lastName: user.lastName,
      me,
      // You never follow yourself (the follow endpoint rejects it), so the
      // self case skips the lookup and answers false.
      following: edge !== null,
      counts: { followers, following },
      visible,
      showRoutes: visibility !== 'hidden',
      // Routes are private by default (RUN-64), so they are dropped from the
      // payload rather than hidden by the client: data the viewer may not see
      // must not be in the response for a devtools tab to un-hide (RUN-54,
      // extending the rule RUN-63 already applies to the whole body). RUN-55
      // applies the same rule to the ENDS of a granted route.
      runs:
        runs === null
          ? null
          : runs.map((row) =>
              toRunResponse(row, { routeVisibility: visibility }),
            ),
    };
  }

  // Runners matching a name (RUN-62 AC1), never including the caller: you
  // cannot follow yourself, so your own row would be the one result with no
  // action on it.
  //
  // The counts are read on every call, matching query or not, because the
  // People page shows them next to the box before anything is typed - which
  // is also the whole answer to the no-query state, so that case costs two
  // counts and touches the User table not at all.
  async searchUsers(
    viewerId: string,
    query: UserSearchQueryDto,
  ): Promise<UserSearchResponse> {
    const { page, pageSize, skip } = resolvePagination(query);
    const terms = searchTerms(query.search);

    // Independent of each other, so one round trip rather than three in a
    // row. The matches query chains its own dependent reads internally.
    const [followers, following, matches] = await Promise.all([
      this.prisma.follow.count({ where: { followeeId: viewerId } }),
      this.prisma.follow.count({ where: { followerId: viewerId } }),
      this.findMatches(viewerId, terms, skip, pageSize),
    ]);

    return {
      items: matches.items,
      total: matches.total,
      page,
      pageSize,
      counts: { followers, following },
    };
  }

  // One page of name matches plus the size of the whole match set, so the
  // page can say "showing 20 of 43" rather than pretending the cap is the
  // answer. An empty query short-circuits: no terms means no LIKE at all,
  // not a LIKE '%%' over every account in the database.
  private async findMatches(
    viewerId: string,
    terms: string[],
    skip: number,
    take: number,
  ): Promise<{ items: FoundUser[]; total: number }> {
    if (terms.length === 0) return { items: [], total: 0 };

    // Every term must match SOMEWHERE in the name, either half. That is what
    // makes "ana tes" find Ana Tester while "ana zzz" finds nobody, and it
    // works typed in either order because neither term is pinned to a
    // column. Case-insensitive per term (AC1).
    const where = {
      id: { not: viewerId },
      AND: terms.map((term) => ({
        OR: [
          { firstName: { contains: term, mode: 'insensitive' as const } },
          { lastName: { contains: term, mode: 'insensitive' as const } },
        ],
      })),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SEARCH_SELECT,
        orderBy: [...USER_SEARCH_ORDER],
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    // One query for the whole page's follow state, not one per row.
    const followed = await this.followedSet(
      viewerId,
      rows.map((row) => row.id),
    );

    return {
      items: rows.map((row) => ({ ...row, following: followed.has(row.id) })),
      total,
    };
  }

  // Which of these users the caller already follows.
  private async followedSet(
    viewerId: string,
    ids: string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const edges = await this.prisma.follow.findMany({
      where: { followerId: viewerId, followeeId: { in: ids } },
      select: { followeeId: true },
    });
    return new Set(edges.map((edge) => edge.followeeId));
  }
}
