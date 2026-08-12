import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  currentWeekCandidates,
  WeekTargetsService,
} from '../week-targets/week-targets.service';
import { isPrismaError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { Profile as ProfileRow } from '../generated/prisma/client';
import { PutProfileDto, type RunningLevel } from './dto/put-profile.dto';

// The API shape of the profile: exactly the Profile table from
// docs/data-model.md. One row per user, so there is no id in the contract -
// the owner is implicit in the token, same as every entity since RUN-57.
// Since RUN-59 this is the SETUP ANSWERS only; the runner's name and email
// come from GET /api/account.
export interface ProfileResponse {
  runningLevel: RunningLevel;
  defaultWeeklyGoalKm: number;
}

// There was a toRunningLevel guard here until RUN-78, the twin of the one in
// runs/run-response.ts, throwing a 500 on a stored value outside the
// vocabulary. The column is a database enum now, so there is nothing left for
// it to catch: the generated $Enums.RunningLevel is the same three values as
// the DTO's union, assigned straight across below.

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weekTargets: WeekTargetsService,
  ) {}

  private toResponse(row: ProfileRow): ProfileResponse {
    return {
      runningLevel: row.runningLevel,
      defaultWeeklyGoalKm: row.defaultWeeklyGoalKm,
    };
  }

  // 404 before the first PUT: "this account has not finished onboarding
  // yet" is an expected state the frontend routes on (RUN-50 derives the
  // onboarding gate from exactly this response), not an error to mask.
  async get(userId: string): Promise<ProfileResponse> {
    const row = await this.prisma.profile.findUnique({ where: { userId } });
    if (!row) throw new NotFoundException('Profile not found');
    return this.toResponse(row);
  }

  // Create-or-replace in one atomic upsert on the unique userId: no
  // read-then-write window for two concurrent PUTs to race through, the
  // slower one simply wins whole.
  //
  // SET-6, enforced HERE: changing defaultWeeklyGoalKm must leave the
  // running week's target alone, so before the new default lands, every
  // Monday a client could honestly call "this week" is materialized under
  // the OLD goal state. Trusting each client to GET-before-PUT would make
  // the invariant break on the first client that forgets.
  //
  // KNOWN, BOUNDED EXCEPTION to "past weeks never materialize": while the
  // week boundary crosses the globe (26 h/week, see currentWeekCandidates)
  // there are two candidate Mondays, and for any given client one of them
  // is adjacent history. Freezing both can therefore create one row for a
  // week the caller's clock has just left. Blast radius: at most one week,
  // only during that window, only when the default changes inside it, and
  // the value written is the pre-change default - which is also what that
  // week would have snapshotted had it been displayed while live, unless
  // the default changed more than once that week unseen. Accepted: the
  // alternative (asking the client which week it means) trusts the caller
  // for the exact invariant this method exists to stop trusting them on.
  //
  // Skipped on first create: that is onboarding finishing, not a default
  // changing. No week has been displayed yet, so there is no snapshot
  // truth to protect - the running week will simply seed from whatever
  // state onboarding leaves behind, whichever order RUN-50 saves the
  // profile and goal in. The read-then-freeze-then-upsert is not one
  // atomic step, but losing the race costs at worst one week snapshotted
  // at the newer default.
  async put(userId: string, dto: PutProfileDto): Promise<ProfileResponse> {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
      select: { defaultWeeklyGoalKm: true },
    });
    if (existing && existing.defaultWeeklyGoalKm !== dto.defaultWeeklyGoalKm) {
      await Promise.all(
        currentWeekCandidates().map((weekStart) =>
          this.weekTargets.ensure(userId, weekStart),
        ),
      );
    }

    // Field by field, never a dto spread: a spread silently widens the
    // write the moment the DTO gains a field that is not a column (or not
    // meant to be client-writable).
    const data = {
      runningLevel: dto.runningLevel,
      defaultWeeklyGoalKm: dto.defaultWeeklyGoalKm,
    };
    try {
      const row = await this.prisma.profile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      return this.toResponse(row);
    } catch (error) {
      // P2003 = the userId foreign key has no User row: the token verified
      // but its account was deleted mid-session. Answer like any other
      // dead session instead of a 500.
      if (isPrismaError(error, 'P2003')) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      throw error;
    }
  }
}
