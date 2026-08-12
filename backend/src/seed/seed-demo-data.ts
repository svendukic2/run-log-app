// The writing half of the demo seeder (RUN-71): takes the plain dataset
// demo-data.ts produced and puts it in the database. Deliberately thin and
// boring - every decision about what the demo LOOKS like was already made,
// and tested, one file over. What is left here is rows.
//
// It takes a PrismaClient rather than reaching for one, which is what lets
// both callers work: the CLI (seed.ts) hands it the app's own PrismaService,
// and test/seed.e2e-spec.ts hands it the e2e suite's, so CI proves the half
// that cannot be run on a machine with no database.
import * as bcrypt from 'bcrypt';
// The hashing PARAMETER, not a second opinion on it: seeded accounts have to
// sign in through the real Sign in screen, so their hashes must be what
// AuthService.signup would have written.
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import { toDbDate } from '../common/dates';
import type { NewFollowerPayload } from '../notifications/notifications.service';
import { ROUTE_SOURCE_DEMO_SEED } from '../routes/route-sources';
// Value import: Prisma.DbNull is read at runtime (routeColumns below).
import { Prisma } from '../generated/prisma/client';
import type { PrismaClient } from '../generated/prisma/client';
import {
  buildDemoDataset,
  DEMO_EMAIL_DOMAIN,
  DEMO_PASSWORD,
  type BuildDemoDatasetOptions,
} from './demo-data';
import type { DemoRoute } from './demo-routes';

export interface DemoSeedSummary {
  removedUsers: number;
  users: number;
  runs: number;
  // How many of those runs carry a Zagreb route (RUN-77 AC6). Reported rather
  // than left to be counted in psql because it is the one number that says
  // whether the event map has anything to draw.
  routedRuns: number;
  follows: number;
  notifications: number;
  events: number;
}

// Postgres' default statement timeout is not the constraint here; Prisma's
// interactive-transaction default of 5 s is, and roughly 500 inserts can
// exceed it on a cold CI container. Raised rather than split into several
// transactions, because a half-seeded database is worse than a slow one.
const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 20_000;

export type SeedDemoDataOptions = BuildDemoDatasetOptions;

// AC2, idempotency: every seeded account lives on the demo email domain and
// nothing else does, so the seeder can delete exactly its own previous
// output and write it again. Delete-then-write rather than upsert-by-email
// on purpose - upserting users would leave the PREVIOUS run's runs, follows
// and event rows behind and grow the demo on every invocation, which is the
// duplication AC2 is about. Every child row hangs off User (or off the
// event, which hangs off its owner) with onDelete: Cascade, so one deleteMany
// takes the whole previous demo with it.
//
// The blast radius is exactly the demo: a real account is never touched. The
// one crossing edge is a real user who followed a demo account or joined the
// demo event - that edge goes too, because it points at rows that no longer
// exist. Notifications a real user already received survive: their payloads
// are self-contained snapshots by design (RUN-65 AC4).
export async function seedDemoData(
  prisma: PrismaClient,
  options: SeedDemoDataOptions = {},
): Promise<DemoSeedSummary> {
  const dataset = buildDemoDataset(options);

  // Hashed ONCE, outside the transaction, and shared by all fifteen
  // accounts. Outside because bcrypt at cost 12 is ~300 ms of CPU and a
  // transaction should not be held open across it. Once because there is
  // exactly one demo password and it is published in docs/data-model.md -
  // per-account salts protect nothing when the plaintext is in the repo,
  // and paying 15 times for that would add ~5 s to every seed and every CI
  // run of the e2e spec.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  return prisma.$transaction(
    async (tx) => {
      const removed = await tx.user.deleteMany({
        where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
      });

      const idByEmail = new Map<string, string>();
      for (const user of dataset.users) {
        const row = await tx.user.create({
          data: {
            email: user.email,
            passwordHash,
            firstName: user.firstName,
            lastName: user.lastName,
            // Explicit, because the column defaults are all false: without
            // this the whole demo is invisible on every social screen.
            profilePublic: user.privacy.profilePublic,
            showOnLeaderboard: user.privacy.showOnLeaderboard,
            showRoutes: user.privacy.showRoutes,
            // The profile is what "onboarding complete" is derived from, so
            // a seeded account signs in straight onto the dashboard instead
            // of into the setup wizard.
            profile: {
              create: {
                runningLevel: user.runningLevel,
                defaultWeeklyGoalKm: user.weeklyGoalKm,
              },
            },
            goal: {
              create: {
                km: user.weeklyGoalKm,
                startDate: toDbDate(user.goalStartDate),
                endDate: null,
              },
            },
          },
          select: { id: true },
        });
        idByEmail.set(user.email, row.id);
      }

      // Before the runs since RUN-76, and that order is now load-bearing: a
      // tagged run carries this event's id, so the event has to exist first.
      const { event } = dataset;
      const eventRow = await tx.event.create({
        data: {
          name: event.name,
          description: event.description,
          startDate: toDbDate(event.startDate),
          endDate: toDbDate(event.endDate),
          targetKm: event.targetKm,
          ownerId: requireId(idByEmail, event.ownerEmail),
          participants: {
            create: event.participantEmails.map((email) => ({
              userId: requireId(idByEmail, email),
            })),
          },
        },
        select: { id: true },
      });

      // Not nested under the user creates above: ~500 rows as one
      // createMany is one INSERT, where the nested form is one per run.
      const runs = await tx.run.createMany({
        data: dataset.users.flatMap((user) =>
          user.runs.map((run) => ({
            routeName: run.routeName,
            distanceKm: run.distanceKm,
            durationSeconds: run.durationSeconds,
            date: toDbDate(run.date),
            effort: run.effort,
            note: run.note,
            userId: requireId(idByEmail, user.email),
            // AC5: the event's own runs, which is what its leaderboard counts
            // and its feed lists since tagging became explicit (RUN-76). The
            // generator decided WHICH runs; this only carries the id.
            eventId: run.inEvent ? eventRow.id : null,
            ...routeColumns(run.route),
          })),
        ),
      });

      const follows = await tx.follow.createMany({
        data: dataset.follows.map((edge) => ({
          followerId: requireId(idByEmail, edge.followerEmail),
          followeeId: requireId(idByEmail, edge.followeeEmail),
        })),
      });

      const actorsByEmail = new Map(
        dataset.users.map((user) => [user.email, user]),
      );
      const now = Date.now();
      const notifications = await tx.notification.createMany({
        data: dataset.notifications.map((notification, index) => {
          const actor = actorsByEmail.get(notification.actorEmail);
          const payload: NewFollowerPayload = {
            followerId: requireId(idByEmail, notification.actorEmail),
            firstName: actor?.firstName ?? '',
            lastName: actor?.lastName ?? '',
          };
          return {
            type: 'new-follower',
            payload,
            userId: requireId(idByEmail, notification.userEmail),
            // Spread over the last few hours instead of all landing on the
            // same instant, so the bell renders a plausible "3h ago" list
            // rather than a stack of identical timestamps.
            createdAt: new Date(now - (index + 1) * 3_600_000),
          };
        }),
      });

      return {
        removedUsers: removed.count,
        users: idByEmail.size,
        runs: runs.count,
        // Counted off the dataset rather than with a second query: createMany
        // reports a total only, and the dataset is what decided which runs got a
        // route in the first place.
        routedRuns: dataset.users.reduce(
          (total, user) =>
            total + user.runs.filter((run) => run.route !== null).length,
          0,
        ),
        follows: follows.count,
        notifications: notifications.count,
        events: 1,
      };
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
  );
}

// The three route columns for one run (RUN-77), returned as ONE object so
// all-or-none is structural here the way it is everywhere else: there is no way
// to write a polyline without its waypoints and its source, which is the
// invariant the database CHECK enforces and run-response.ts throws a named 500
// over.
//
// A near-twin of runs.service's routeColumns and deliberately not shared with it:
// that one stamps ROUTE_SOURCE_OPENROUTESERVICE, because the only route a user
// can save is one the app's own proxy planned. A seeded route was not, and
// borrowing the function would mean seeding a row that claims it was.
//
// Prisma needs DbNull rather than null to put SQL NULL into a nullable Json
// column, which is the only reason "no route" is not simply three nulls.
function routeColumns(route: DemoRoute | null): {
  routePolyline: string | null;
  routeWaypoints: Prisma.InputJsonValue | typeof Prisma.DbNull;
  routeSource: string | null;
} {
  if (!route) {
    return {
      routePolyline: null,
      routeWaypoints: Prisma.DbNull,
      routeSource: null,
    };
  }
  return {
    routePolyline: route.polyline,
    // Rebuilt point by point rather than handed over as-is: the table's entries
    // are readonly, and rebuilding is what keeps a future extra key on a
    // DemoRoute waypoint out of a JSONB column that run-response.ts re-validates
    // on the way out.
    routeWaypoints: route.waypoints.map((point) => ({
      lat: point.lat,
      lng: point.lng,
    })),
    routeSource: ROUTE_SOURCE_DEMO_SEED,
  };
}

// Every email in the dataset's follows, notifications and event comes from
// its own users list, so a miss is a bug in the generator rather than
// something to paper over with a fallback id.
function requireId(idByEmail: Map<string, string>, email: string): string {
  const id = idByEmail.get(email);
  if (!id) {
    throw new Error(`Demo dataset references an unknown account: ${email}`);
  }
  return id;
}
