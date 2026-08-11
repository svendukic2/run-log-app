import { InternalServerErrorException } from '@nestjs/common';
import { toIsoDate } from '../common/dates';
import type { Run as RunRow } from '../generated/prisma/client';
import { EFFORT_LEVELS, type Effort } from './dto/create-run.dto';

// The API shape of a run and the one mapper that produces it, split out of
// runs.service in RUN-63 so the public profile can serve another runner's
// runs through exactly the same contract. A second hand-written mapper is
// how the two surfaces would quietly start disagreeing about what a run
// looks like - and how the effort validation below would end up applied on
// one path only.

// Exactly the Run type from docs/data-model.md and frontend/src/lib/runs.ts.
// `date` is a yyyy-mm-dd string, never a Date or timestamp, and nothing
// derived (pace, totals) is ever part of it. userId is deliberately NOT in
// the response: the owner is implicit in the token on /api/runs, and on a
// public profile it is the profile's own id.
export interface RunResponse {
  id: string;
  routeName: string;
  distanceKm: number;
  durationSeconds: number;
  date: string;
  effort: Effort;
  note: string;
}

// The column is plain TEXT until RUN-73 adds a real enum, so a row edited
// outside the API (psql, a seed script) can hold anything. A loud 500 that
// names the row beats a silently wrong Effort type reaching the frontend's
// exhaustive switches.
function toEffort(rowId: string, value: string): Effort {
  if (!(EFFORT_LEVELS as readonly string[]).includes(value)) {
    throw new InternalServerErrorException(
      `Run ${rowId} has stored effort "${value}", not one of: ${EFFORT_LEVELS.join(', ')}. Fix the row (RUN-73 adds the enum that prevents this).`,
    );
  }
  return value as Effort;
}

export function toRunResponse(row: RunRow): RunResponse {
  return {
    id: row.id,
    routeName: row.routeName,
    distanceKm: row.distanceKm,
    durationSeconds: row.durationSeconds,
    date: toIsoDate(row.date),
    effort: toEffort(row.id, row.effort),
    note: row.note,
  };
}

// The order every screen shows runs in, newest first. Same-day runs have no
// insertion timestamp in the contract (docs/data-model.md), so the id is the
// tiebreak: arbitrary but deterministic across requests. Shared with the
// public profile read so both lists arrive in the same order, and mirrored
// on the client by compareRunsNewestFirst in frontend/src/lib/runs.ts.
export const runsNewestFirstOrder = [
  { date: 'desc' },
  { id: 'desc' },
] as const;
