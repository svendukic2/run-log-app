import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './create-test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import type { AuthResponse } from '../src/auth/auth.service';
import type {
  EventListResponse,
  EventParticipantListResponse,
  EventRunListResponse,
} from '../src/events/events.service';
import type { LeaderboardResponse } from '../src/leaderboard/leaderboard.service';
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_PASSWORD,
  DEMO_PRIMARY_EMAIL,
  DEMO_USER_COUNT,
} from '../src/seed/demo-data';
import { DEMO_ROUTES } from '../src/seed/demo-routes';
import { seedDemoData } from '../src/seed/seed-demo-data';

// The demo seeder against a real database (RUN-71). This file exists because
// the ticket was written on a machine with no local Postgres: `npm run seed`
// was never executed by hand, and CI's service container is the only thing
// that ever runs it. What the generator's own spec cannot prove - that the
// rows land (AC1) and that a second run replaces them instead of doubling
// them (AC2) - is proved here.
//
// The seeder is called directly rather than spawned as `npm run seed`, so
// this exercises the same function the CLI calls with the suite's own
// database connection. The CLI wrapper around it is one env guard and one
// console.log.

// Every test here seeds at least once, and one seed is a cost-12 bcrypt hash
// plus ~550 inserts. Jest's default 5 s timeout is not enough for that on a
// cold CI container - the same reasoning that raised the writer's own
// transaction timeout - and a suite whose only job is to exercise code that
// was never run locally must not be the flaky one.
const SEED_TEST_TIMEOUT_MS = 180_000;

describe('Demo seeder (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const demoUserFilter = { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } };

  const countDemoRows = async () => ({
    users: await prisma.user.count({ where: demoUserFilter }),
    runs: await prisma.run.count({ where: { user: demoUserFilter } }),
    // Counted separately so the idempotency comparison below covers the route
    // columns too (RUN-77): a second seed must leave the same lines, not more.
    routedRuns: await prisma.run.count({
      where: { user: demoUserFilter, routePolyline: { not: null } },
    }),
    follows: await prisma.follow.count({
      where: { follower: demoUserFilter },
    }),
    notifications: await prisma.notification.count({
      where: { user: demoUserFilter },
    }),
    events: await prisma.event.count({ where: { owner: demoUserFilter } }),
  });

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
    await prisma.user.deleteMany();
  });

  // Cascades roughly 550 runs plus the follows, notifications and the event
  // out with the accounts, so it gets the same headroom the tests do.
  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  }, SEED_TEST_TIMEOUT_MS);

  it(
    'fills an empty database and stays the same size when run twice (AC1, AC2)',
    async () => {
      const first = await seedDemoData(prisma);
      expect(first.removedUsers).toBe(0);
      expect(first.users).toBe(DEMO_USER_COUNT);

      const afterFirst = await countDemoRows();
      expect(afterFirst.users).toBe(DEMO_USER_COUNT);
      expect(afterFirst.runs).toBeGreaterThan(200);
      // The summary the CLI prints agrees with what is in the table, and there
      // is geometry for the event map to draw at all (RUN-77 AC6).
      expect(afterFirst.routedRuns).toBe(first.routedRuns);
      expect(afterFirst.routedRuns).toBeGreaterThan(4);
      expect(afterFirst.follows).toBeGreaterThan(10);
      expect(afterFirst.notifications).toBeGreaterThan(0);
      expect(afterFirst.events).toBe(1);

      // AC2. The second run finds its own previous output by the demo email
      // marker and replaces it, so every count is identical rather than
      // doubled - which is the failure mode a seeder without a marker has.
      const second = await seedDemoData(prisma);
      expect(second.removedUsers).toBe(DEMO_USER_COUNT);
      expect(await countDemoRows()).toEqual(afterFirst);
    },
    SEED_TEST_TIMEOUT_MS,
  );

  it(
    'produces a demo that can be signed into and looks alive (AC1, AC4)',
    async () => {
      await seedDemoData(prisma);

      // AC4: the shared password works through the real login endpoint, which
      // is only true if the seeder hashed it the way signup does.
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: DEMO_PRIMARY_EMAIL, password: DEMO_PASSWORD })
        .expect(200);
      const auth = {
        Authorization: `Bearer ${(login.body as AuthResponse).token}`,
      };

      // The global weekly board reads the CURRENT week and only opted-in
      // accounts, so an empty list here would mean either that the history
      // stopped last Sunday or that the privacy columns were left at their
      // false defaults.
      const leaderboard = await request(app.getHttpServer())
        .get('/api/leaderboard')
        .set(auth)
        .expect(200);
      const board = leaderboard.body as LeaderboardResponse;
      expect(board.items.length).toBe(DEMO_USER_COUNT - 1);
      expect(board.items[0].totalKm).toBeGreaterThan(0);
      expect(board.me).not.toBeNull();

      // One event whose derived state is 'active', with a populated board.
      const events = await request(app.getHttpServer())
        .get('/api/events?state=active')
        .set(auth)
        .expect(200);
      const list = events.body as EventListResponse;
      expect(list.items).toHaveLength(1);
      expect(list.items[0].participantCount).toBeGreaterThan(5);

      const participants = await request(app.getHttpServer())
        .get(`/api/events/${list.items[0].id}/participants`)
        .set(auth)
        .expect(200);
      const board2 = participants.body as EventParticipantListResponse;
      expect(board2.items.length).toBe(list.items[0].participantCount);
      // Ranked participants have run inside the window, so the event board is
      // a leaderboard rather than a list of zeros.
      const ranked = board2.items.filter((row) => row.rank !== null);
      expect(ranked.length).toBeGreaterThan(5);
      expect(ranked.every((row) => (row.totalKm ?? 0) > 0)).toBe(true);
      // The one account deliberately left private is a participant with its
      // numbers withheld, which is what makes the privacy gate demonstrable.
      expect(board2.items.some((row) => row.rank === null)).toBe(true);

      // RUN-76 AC5 + AC6, over HTTP: the event's runs are tagged, and there is
      // exactly ONE per participant - a hundred rows on one event page would be
      // a demo of nothing. The private participant's run is not in the feed at
      // all, because a feed of their rows would rebuild the total the board
      // beside it withholds.
      const feed = await request(app.getHttpServer())
        .get(`/api/events/${list.items[0].id}/runs`)
        .set(auth)
        .expect(200);
      const runs = feed.body as EventRunListResponse;
      expect(runs.items).toHaveLength(ranked.length);
      expect(new Set(runs.items.map((run) => run.runner.id)).size).toBe(
        runs.items.length,
      );
      expect(runs.items.every((run) => run.distanceKm > 0)).toBe(true);

      // RUN-77 AC6, over HTTP and through the same gate the browser reads: the
      // event map has one line per participant on the board, and they are all
      // DIFFERENT lines. Same colour reasoning as the generator's own spec - two
      // runners on identical coordinates would draw one line hiding another
      // under a legend claiming to tell them apart - but asserted here on what
      // actually came out of the database and past canViewRoutes.
      const polylines = runs.items.map((run) => run.route?.polyline);
      expect(polylines.every((polyline) => typeof polyline === 'string')).toBe(
        true,
      );
      expect(new Set(polylines).size).toBe(polylines.length);
      // Whole routes, so a seeded polyline is exactly what demo-routes.ts holds
      // (decision 1 skips RUN-55's trim here). The table's shortest entry is
      // 410 characters, so anything much smaller means something trimmed it.
      expect(
        Math.min(...polylines.map((polyline) => polyline?.length ?? 0)),
      ).toBeGreaterThan(300);
      // And the distance on the row is the route's own length, which is what
      // keeps the run detail page from contradicting the line it draws.
      for (const run of runs.items) {
        expect(
          DEMO_ROUTES.some(
            (route) =>
              route.polyline === run.route?.polyline &&
              route.distanceKm === run.distanceKm,
          ),
        ).toBe(true);
      }
    },
    SEED_TEST_TIMEOUT_MS,
  );
});
