import { Prisma } from '../generated/prisma/client';

// The Decimal boundary (RUN-78 item 2).
//
// Run.distanceKm is NUMERIC(5, 2) in Postgres, which Prisma hands back as a
// Decimal - a decimal.js object, not a number. That is the right thing to
// store and the wrong thing to serve: JSON.stringify turns a Decimal into
// {"s":1,"e":0,"d":[8,2]}, and `decimal > 60` compares an object to a number
// and is always false. AC3 says the API keeps returning a plain JSON number,
// so the object must never leave the backend.
//
// The rule this file enforces: a Decimal is converted the moment it comes out
// of Prisma, and every downstream reader keeps taking plain numbers. Pure
// modules (runLimits, ranking) know nothing about Decimal, which is what
// keeps them testable without a database and free of a second numeric type.
//
// Every place a distance leaves Prisma calls through here:
//   - runs/run-response.ts        the mapper, for every runs response
//   - runs/runs.service.ts        the notification payload and the merged
//                                 limit check on PATCH
//   - leaderboard/leaderboard.service.ts  the weekly _sum and outlier read
//   - events/events.service.ts            the same two for an event window,
//                                 plus the event run feed's mapper (RUN-76,
//                                 which landed in parallel and is exactly the
//                                 "a new one appeared" case this list is for)
//   - users/users.service.ts      serves runs through the mapper above, so it
//                                 needs nothing of its own
//
// When the next one appears, add it here rather than converting inline: the
// bug this guards against is a comparison that silently reads false, which no
// test notices until a leaderboard is wrong.

// One distance as a plain number. `null` becomes 0 because the only source of
// a null here is an aggregate over no rows, which is a total of zero.
export function kmNumber(
  value: Prisma.Decimal | number | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

// The same conversion for the row shape both leaderboards read for the
// outlier check: the two columns the pace rule needs, with the distance
// already a number so runLimits never sees a Decimal.
export function toMeasuredRuns<T extends { distanceKm: Prisma.Decimal }>(
  rows: T[],
): Array<Omit<T, 'distanceKm'> & { distanceKm: number }> {
  return rows.map((row) => ({ ...row, distanceKm: kmNumber(row.distanceKm) }));
}
