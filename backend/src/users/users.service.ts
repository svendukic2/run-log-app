import { Injectable, NotFoundException } from '@nestjs/common';
import { canViewProfile, canViewRoutes } from '../common/privacy';
import { PrismaService } from '../prisma/prisma.service';
import {
  runsNewestFirstOrder,
  toRunResponse,
  type RunResponse,
} from '../runs/run-response';

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
  // Whether route maps may be rendered for these runs (RUN-72 draws them;
  // no route data exists to send yet, which is why this is a permission and
  // not a payload).
  showRoutes: boolean;
  runs: RunResponse[] | null;
}

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
    // with a gated body: a 403 here would tell anyone walking ids which of
    // them are real accounts, which is exactly what the setting is meant to
    // withhold.
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
      showRoutes: canViewRoutes(user, viewerId, id),
      runs: runs === null ? null : runs.map(toRunResponse),
    };
  }
}
