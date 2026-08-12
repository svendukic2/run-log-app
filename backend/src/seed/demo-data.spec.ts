// Needed before the create-run DTO's constants are imported below: that module
// carries class-validator decorators, whose runtime needs reflect-metadata
// loaded first. Same one-liner, same reason, as create-run.dto.spec.ts.
import 'reflect-metadata';
import { mondayOf } from '../common/dates';
import { isOutlierRun, runLimitViolation } from '../common/runLimits';
import {
  MAX_ROUTE_POINTS,
  MIN_ROUTE_POINTS,
  ROUTE_POLYLINE_MAX_LENGTH,
} from '../runs/dto/create-run.dto';
import { decodePolyline, POLYLINE_PRECISION } from '../runs/route-trim';
import {
  buildDemoDataset,
  DEMO_EMAIL_DOMAIN,
  DEMO_PRIMARY_EMAIL,
  DEMO_USER_COUNT,
} from './demo-data';
import { DEMO_ROUTES, ZAGREB_BOUNDS } from './demo-routes';

// Two tests, and they are the two the ticket cannot be proved without on a
// machine with no database (see demo-data.ts). Everything about the WRITING
// half - that the rows land and that a second run does not duplicate them -
// is proved by test/seed.e2e-spec.ts against CI's real Postgres.
//
// A fixed `today` throughout, on a Wednesday: the generator's only
// interesting branch is the partial current week, and pinning the day is
// what stops this suite from being a different test on a Monday.
const TODAY = '2026-08-12';

describe('demo dataset (RUN-71)', () => {
  it('never generates a run the anti-cheat guardrails would flag (AC3)', () => {
    const { users } = buildDemoDataset({ today: TODAY });
    const runs = users.flatMap((user) => user.runs);
    // Guards the test itself: an empty history would pass every assertion
    // below without proving anything.
    expect(runs.length).toBeGreaterThan(200);

    for (const run of runs) {
      // Asserted with RUN-72's OWN functions rather than against numbers
      // copied out of it, so this fails if the guardrails ever tighten past
      // what the seeder generates - which is the whole point of AC3.
      //
      // Both tiers, because AC3 is "not flagged", which is stricter than
      // "legal": runLimitViolation is the hard check that would refuse the
      // write, isOutlierRun is the soft one that would still store the run
      // and mark it unverified on every leaderboard.
      expect(runLimitViolation(run)).toBeNull();
      expect(isOutlierRun(run)).toBe(false);
      // Runs use a DATE column and the API refuses future days, so no
      // generated day may be past today.
      expect(run.date <= TODAY).toBe(true);
    }
  });

  it('has the shape the leaderboard and event pages need to look alive (AC1)', () => {
    const dataset = buildDemoDataset({ today: TODAY });
    const emails = new Set(dataset.users.map((user) => user.email));

    expect(dataset.users).toHaveLength(DEMO_USER_COUNT);
    expect(emails.size).toBe(DEMO_USER_COUNT);
    expect(emails).toContain(DEMO_PRIMARY_EMAIL);
    for (const email of emails) {
      expect(email.endsWith(`@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
    }

    // The privacy columns default to false, so a seeded account is on no
    // leaderboard unless it was explicitly opted in. One account is left
    // private on purpose to keep the gate demonstrable.
    const ranked = dataset.users.filter(
      (user) => user.privacy.showOnLeaderboard,
    );
    expect(ranked).toHaveLength(DEMO_USER_COUNT - 1);

    // The global weekly board only shows the CURRENT Monday-Sunday week, so
    // a history that stops last Sunday renders an empty page.
    const currentMonday = mondayOf(TODAY);
    for (const user of ranked) {
      const thisWeek = user.runs.filter((run) => run.date >= currentMonday);
      expect(thisWeek.length).toBeGreaterThan(0);
    }

    // A follow web that actually connects the account we sign in as.
    expect(dataset.follows.length).toBeGreaterThan(10);
    for (const edge of dataset.follows) {
      expect(emails).toContain(edge.followerEmail);
      expect(emails).toContain(edge.followeeEmail);
      expect(edge.followerEmail).not.toBe(edge.followeeEmail);
    }
    expect(
      dataset.follows.some((edge) => edge.followeeEmail === DEMO_PRIMARY_EMAIL),
    ).toBe(true);
    expect(
      dataset.follows.some((edge) => edge.followerEmail === DEMO_PRIMARY_EMAIL),
    ).toBe(true);

    // The bell gets a handful of entries, not hundreds (the deliberate
    // choice documented in buildNotifications).
    expect(dataset.notifications.length).toBeGreaterThan(0);
    expect(dataset.notifications.length).toBeLessThan(20);

    // One event whose window contains today, so deriveEventState says
    // 'active', with the owner among its participants.
    const { event } = dataset;
    expect(event.startDate < TODAY).toBe(true);
    expect(event.endDate > TODAY).toBe(true);
    expect(event.participantEmails).toContain(event.ownerEmail);
    expect(event.participantEmails.length).toBeGreaterThan(5);
    expect(new Set(event.participantEmails).size).toBe(
      event.participantEmails.length,
    );

    // RUN-76 AC5 + AC6: the event's runs are TAGGED, and there is EXACTLY ONE
    // per participant. Both halves matter for different reasons - untagged, the
    // board would show nine participants on zero kilometres; tagged wholesale, a
    // hundred rows would land on one event page.
    const participants = new Set(event.participantEmails);
    const taggedPerUser = new Map(
      dataset.users.map((user) => [
        user.email,
        user.runs.filter((run) => run.inEvent),
      ]),
    );

    for (const [email, tagged] of taggedPerUser) {
      // Only participants have tags, and each of them has exactly one.
      expect(tagged).toHaveLength(participants.has(email) ? 1 : 0);
      for (const run of tagged) {
        // The two rules the API would apply (runs.service assertTaggable), and
        // they are asserted HERE because the seeder writes through Prisma: it
        // bypasses the DTO and the service, so nothing else would stop it
        // writing a tag the API itself rejects.
        expect(run.date >= event.startDate).toBe(true);
        expect(run.date <= event.endDate).toBe(true);
      }
    }
    expect(participants.size).toBeGreaterThan(5);

    // The target is scaled to what was tagged, so the page's headline number and
    // the board under it are talking about the same runs: ahead of the total,
    // within reach of it.
    const taggedKm = [...taggedPerUser.values()]
      .flat()
      .reduce((total, run) => total + run.distanceKm, 0);
    expect(event.targetKm).toBeGreaterThan(taggedKm);
    expect(event.targetKm).toBeLessThan(taggedKm * 3);

    // Determinism (house rule): the same day produces the same demo, so the
    // screens can be talked about the same way twice.
    expect(buildDemoDataset({ today: TODAY })).toEqual(dataset);

    // The one genuinely different case, asserted here rather than as a third
    // test: seeded on a MONDAY the current week offers exactly one day, and
    // that is the day the whole of AC1 rests on - a Monday demo whose
    // leaderboard is empty is the bug this ticket exists to prevent.
    const monday = buildDemoDataset({ today: '2026-08-10' });
    expect(mondayOf('2026-08-10')).toBe('2026-08-10');
    for (const user of monday.users.filter(
      (candidate) => candidate.privacy.showOnLeaderboard,
    )) {
      expect(
        user.runs.filter((run) => run.date === '2026-08-10'),
      ).not.toHaveLength(0);
    }
  });

  // RUN-77 AC6 and AC7. Its own test rather than more assertions on the one
  // above, because it is about a different thing: that one is "the screens have
  // data", this is "the event map has exactly one distinct, honest line per
  // runner it draws".
  it('gives every event participant one distinct Zagreb route to draw (RUN-77 AC6, AC7)', () => {
    const dataset = buildDemoDataset({ today: TODAY });
    const { event } = dataset;
    const participants = new Set(event.participantEmails);

    // "The map would draw this runner's line": a participant the run feed lists
    // (showOnLeaderboard) whose geometry canViewRoutes would release
    // (profilePublic AND showRoutes). Exactly the predicate attachRoutes filters
    // on, restated here from the two server rules rather than imported, so a
    // change to either side has to be made twice deliberately.
    const drawable = (user: (typeof dataset.users)[number]): boolean =>
      participants.has(user.email) &&
      user.privacy.showOnLeaderboard &&
      user.privacy.profilePublic &&
      user.privacy.showRoutes;

    for (const user of dataset.users) {
      const routed = user.runs.filter((run) => run.route !== null);
      // Exactly one each for the participants the map draws, none for anybody
      // else - including the private participant, whose line nobody may see and
      // who would otherwise be handed the wrap-around duplicate of somebody
      // else's route (review finding). The map's readability rests on the "one
      // each" half too: these accounts run 3-5 times a week across a 21-day
      // window, so routing every in-window run would put around a hundred lines
      // on one map.
      expect(routed).toHaveLength(drawable(user) ? 1 : 0);
      for (const run of routed) {
        // The route only ever lands on the run that is TAGGED to the event -
        // otherwise the map would draw a line for a run its own feed does not
        // list.
        expect(run.inEvent).toBe(true);
        // AC7's second half: the label describes the line beneath it, because
        // both come from the same DemoRoute.
        expect(run.routeName).toBe(run.route?.name);
        // And the distance describes it too, which is what keeps the Edit
        // modal's polyline-vs-distance warning from firing on demo data.
        expect(run.distanceKm).toBe(run.route?.distanceKm);
      }
    }

    // DISTINCT for everyone the map actually draws. AC1 wants one colour per
    // runner, and two runners handed the same route would draw two colours along
    // identical coordinates - one hiding the other, with a legend promising a
    // distinction the map cannot show. This is the assertion that fails the day a
    // ninth drawable participant is added without a ninth route.
    const visible = dataset.users.filter(drawable);
    const drawn = visible.flatMap((user) =>
      user.runs.filter((run) => run.route !== null).map((run) => run.routeName),
    );
    expect(drawn.length).toBeGreaterThan(4);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(drawn.length).toBeLessThanOrEqual(DEMO_ROUTES.length);

    // Handed out in ascending length by running level, so the demo does not put
    // a 23 km embankment run on a Beginner account. Asserted as "every beginner's
    // route is shorter than every advanced one" rather than as an exact mapping,
    // so reordering within a level stays free.
    const lengthsFor = (level: string): number[] =>
      visible
        .filter((user) => user.runningLevel === level)
        .flatMap((user) =>
          user.runs
            .filter((run) => run.route !== null)
            .map((run) => run.distanceKm),
        );
    const beginner = lengthsFor('Beginner');
    const advanced = lengthsFor('Advanced');
    expect(beginner.length).toBeGreaterThan(0);
    expect(advanced.length).toBeGreaterThan(0);
    expect(Math.max(...beginner)).toBeLessThan(Math.min(...advanced));
  });

  // AC8's second half. The determinism half is asserted by the toEqual above;
  // this is the "and it makes no network request to do so" half, which is only
  // provable by taking the network away.
  it('builds the whole dataset without touching the network (RUN-77 AC8)', () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error(
        'The seeder must not make network requests: the geometry is checked in (seed/demo-routes.ts).',
      );
    };
    try {
      const dataset = buildDemoDataset({ today: TODAY });
      // Guards the test: a build that returned nothing would also not fetch.
      expect(
        dataset.users.flatMap((user) =>
          user.runs.filter((run) => run.route !== null),
        ).length,
      ).toBeGreaterThan(4);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

// The eight checked-in polylines, against the limits a real client's write would
// have been held to. This suite is the ONLY thing standing between a hand-added
// ninth route and a broken demo: the seeder writes rows straight through Prisma,
// so RunRouteDto never sees them and nothing at runtime re-checks the geometry.
describe('demo routes (RUN-77 decision 5)', () => {
  const EARTH_RADIUS_KM = 6371;

  // Haversine, local to this suite. route-trim.ts keeps its own metres helper
  // private and this is its only other caller, so exporting it would widen a
  // module's surface for a test rather than for a feature.
  const lengthKm = (points: { lat: number; lng: number }[]): number => {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      const dLat = toRadians(to.lat - from.lat);
      const dLng = toRadians(to.lng - from.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(from.lat)) *
          Math.cos(toRadians(to.lat)) *
          Math.sin(dLng / 2) ** 2;
      total += 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
    }
    return total;
  };

  it('has enough distinct routes for every participant the event map draws', () => {
    expect(DEMO_ROUTES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(DEMO_ROUTES.map((route) => route.name)).size).toBe(
      DEMO_ROUTES.length,
    );
    // Sorted shortest first, which is what demo-data.ts's level-ordered handout
    // relies on.
    const lengths = DEMO_ROUTES.map((route) => route.distanceKm);
    expect([...lengths].sort((a, b) => a - b)).toEqual(lengths);
  });

  it.each(DEMO_ROUTES.map((route) => [route.name, route] as const))(
    '%s decodes to a drawable Zagreb line the API would have accepted',
    (_name, route) => {
      // Asserted with the app's OWN decoder at the app's own precision, so a
      // polyline pasted in at precision 6 fails here rather than drawing a line
      // that drifts off the globe.
      const points = decodePolyline(route.polyline, POLYLINE_PRECISION);
      // decodePolyline returns [] for anything undecodable, so this covers a
      // truncated string and a 3-D one at the same time.
      expect(points.length).toBeGreaterThan(1);

      // What RunRouteDto would have enforced on a real client's write.
      expect(route.polyline.length).toBeLessThanOrEqual(
        ROUTE_POLYLINE_MAX_LENGTH,
      );
      expect(route.waypoints.length).toBeGreaterThanOrEqual(MIN_ROUTE_POINTS);
      expect(route.waypoints.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS);

      // AC7: inside Zagreb, every point of the line and every tapped point.
      for (const point of [...points, ...route.waypoints]) {
        expect(point.lat).toBeGreaterThanOrEqual(ZAGREB_BOUNDS.minLat);
        expect(point.lat).toBeLessThanOrEqual(ZAGREB_BOUNDS.maxLat);
        expect(point.lng).toBeGreaterThanOrEqual(ZAGREB_BOUNDS.minLng);
        expect(point.lng).toBeLessThanOrEqual(ZAGREB_BOUNDS.maxLng);
      }

      // The stated distance is the line's OWN length. It has to be, because
      // demo-data.ts hands it to Run.distanceKm: a route claiming 6.7 km while
      // drawing 18 would put a run detail page at odds with itself and set off
      // the Edit modal's mismatch warning (which fires past 20%). 2% is the
      // rounding-and-haversine slack, not a tolerance for a wrong number.
      expect(Math.abs(lengthKm(points) - route.distanceKm)).toBeLessThan(
        route.distanceKm * 0.02,
      );
    },
  );
});
