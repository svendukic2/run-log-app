import { mondayOf } from '../common/dates';
import {
  buildDemoDataset,
  DEMO_EMAIL_DOMAIN,
  DEMO_PRIMARY_EMAIL,
  DEMO_USER_COUNT,
  RUN_LIMITS,
  RUN_OUTLIER_THRESHOLDS,
} from './demo-data';

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
      const paceSecPerKm = run.durationSeconds / run.distanceKm;
      // AC3 is "not flagged", which is stricter than "legal": the outlier
      // thresholds have to hold, not just the hard limits.
      expect(paceSecPerKm).toBeGreaterThan(
        RUN_OUTLIER_THRESHOLDS.fastPaceSecPerKm,
      );
      expect(run.distanceKm).toBeLessThan(
        RUN_OUTLIER_THRESHOLDS.longDistanceKm,
      );
      expect(paceSecPerKm).toBeLessThan(RUN_LIMITS.slowestPaceSecPerKm);
      expect(run.distanceKm).toBeGreaterThan(0);
      expect(run.durationSeconds).toBeGreaterThan(0);
      expect(run.durationSeconds).toBeLessThan(RUN_LIMITS.maxDurationSec);
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

    // Determinism (house rule): the same day produces the same demo, so the
    // screens can be talked about the same way twice.
    expect(buildDemoDataset({ today: TODAY })).toEqual(dataset);
  });
});
