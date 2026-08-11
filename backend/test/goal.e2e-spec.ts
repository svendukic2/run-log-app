import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  mondayOf,
  addDaysIso,
  toDbDate,
  utcTodayIso,
} from './../src/common/dates';
import type { GoalResponse } from './../src/goal/goal.service';
import type { WeekTargetResponse } from './../src/week-targets/week-targets.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { createE2eApp, signupTestUser, signupUser } from './create-test-app';

function goalBody(response: request.Response): GoalResponse {
  return response.body as GoalResponse;
}

function targetBody(response: request.Response): WeekTargetResponse {
  return response.body as WeekTargetResponse;
}

// The week the suite runs in: always a legal "current week" for the apply
// endpoint, whatever day CI happens to fire on.
const CURRENT_WEEK = mondayOf(utcTodayIso());
// Mondays safely outside the current-week window in either direction.
const PAST_WEEK = '2020-01-06';
const FUTURE_WEEK = addDaysIso(CURRENT_WEEK, 21);

// Full-path goal + week-target flows against the real database (RUN-49),
// including the one rule that spans requests: a week's target snapshots at
// first use and never re-reads the goal after that.
describe('Goal and week targets API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  let userId: string;

  function validGoal() {
    return { km: 20, startDate: '2026-07-14', endDate: '2026-09-14' };
  }

  // Past weeks cannot be materialized through the API (that is the point),
  // so history rows are planted directly, as if the week had been used
  // while it was live.
  function plantWeekTarget(weekStart: string, targetKm: number) {
    return prisma.weekTarget.create({
      data: { userId, weekStart: toDbDate(weekStart), targetKm },
    });
  }

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
    await prisma.user.deleteMany();
    const user = await signupTestUser(app, 'goal-owner');
    auth = user.auth;
    userId = user.id;
  });

  beforeEach(async () => {
    await prisma.weekTarget.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.profile.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  describe('GET/PUT /api/goal', () => {
    it('401s every endpoint without a token', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/goal').expect(401);
      await request(server).put('/api/goal').send(validGoal()).expect(401);
      await request(server).get('/api/week-targets').expect(401);
      await request(server)
        .get(`/api/week-targets/${CURRENT_WEEK}`)
        .expect(401);
      await request(server)
        .put(`/api/week-targets/${CURRENT_WEEK}`)
        .send({ targetKm: 25 })
        .expect(401);
    });

    it('404s the GET before the goal was ever PUT', async () => {
      await request(app.getHttpServer()).get('/api/goal').set(auth).expect(404);
    });

    it('creates on first PUT and returns exactly the contract shape', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/goal')
        .set(auth)
        .send(validGoal())
        .expect(200);
      expect(response.body).toEqual(validGoal());
    });

    it('stores an omitted endDate as null, "No end date"', async () => {
      const { endDate, ...withoutEnd } = validGoal();
      void endDate;
      const response = await request(app.getHttpServer())
        .put('/api/goal')
        .set(auth)
        .send(withoutEnd)
        .expect(200);
      expect(goalBody(response).endDate).toBeNull();
    });

    it('replaces the goal whole on a second PUT', async () => {
      const server = app.getHttpServer();
      await request(server).put('/api/goal').set(auth).send(validGoal());
      await request(server)
        .put('/api/goal')
        .set(auth)
        .send({ km: 35, startDate: '2026-08-01', endDate: null })
        .expect(200);

      const read = await request(server).get('/api/goal').set(auth).expect(200);
      expect(goalBody(read)).toEqual({
        km: 35,
        startDate: '2026-08-01',
        endDate: null,
      });
      expect(await prisma.goal.count()).toBe(1);
    });

    it('400s an end date before the start date', async () => {
      await request(app.getHttpServer())
        .put('/api/goal')
        .set(auth)
        .send({ km: 20, startDate: '2026-07-14', endDate: '2026-07-13' })
        .expect(400);
    });

    it('400s km outside the 0-60 slider', async () => {
      const server = app.getHttpServer();
      await request(server)
        .put('/api/goal')
        .set(auth)
        .send({ ...validGoal(), km: 61 })
        .expect(400);
      await request(server)
        .put('/api/goal')
        .set(auth)
        .send({ ...validGoal(), km: -1 })
        .expect(400);
    });

    it('keeps goals per account', async () => {
      const server = app.getHttpServer();
      await request(server).put('/api/goal').set(auth).send(validGoal());

      const other = await signupUser(app, 'goal-other');
      await request(server).get('/api/goal').set(other).expect(404);
    });
  });

  describe('week-target snapshots', () => {
    it('materializes a week from the goal km on first read', async () => {
      const server = app.getHttpServer();
      await request(server)
        .put('/api/goal')
        .set(auth)
        .send({ ...validGoal(), km: 30 });

      const response = await request(server)
        .get(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .expect(200);
      expect(targetBody(response)).toEqual({
        weekStart: CURRENT_WEEK,
        targetKm: 30,
      });
    });

    it('prefers the profile default over the onboarding goal as the seed', async () => {
      const server = app.getHttpServer();
      await request(server)
        .put('/api/goal')
        .set(auth)
        .send({ ...validGoal(), km: 30 });
      await request(server).put('/api/profile').set(auth).send({
        firstName: 'Ana',
        lastName: 'Anić',
        email: 'ana@example.com',
        runningLevel: 'Beginner',
        defaultWeeklyGoalKm: 45,
      });

      const response = await request(server)
        .get(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .expect(200);
      expect(targetBody(response).targetKm).toBe(45);
    });

    it('falls back to 20 km when the account has set nothing at all', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .expect(200);
      expect(targetBody(response).targetKm).toBe(20);
    });

    it('never re-reads the goal once a week is materialized (the snapshot rule)', async () => {
      const server = app.getHttpServer();
      await request(server)
        .put('/api/goal')
        .set(auth)
        .send({ ...validGoal(), km: 30 });
      await request(server)
        .get(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .expect(200);

      // The goal moves on; the materialized week must not.
      await request(server)
        .put('/api/goal')
        .set(auth)
        .send({ ...validGoal(), km: 55 });

      const again = await request(server)
        .get(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .expect(200);
      expect(targetBody(again).targetKm).toBe(30);
    });

    it('404s a past week that was never materialized instead of fabricating history', async () => {
      // Seeding it from today's goal would freeze a target the runner
      // never had into Hit/Missed history.
      await request(app.getHttpServer())
        .get(`/api/week-targets/${PAST_WEEK}`)
        .set(auth)
        .expect(404);
    });

    it('404s a future week: it snapshots when it arrives', async () => {
      await request(app.getHttpServer())
        .get(`/api/week-targets/${FUTURE_WEEK}`)
        .set(auth)
        .expect(404);
    });

    it('still serves a past week that WAS materialized while live', async () => {
      await plantWeekTarget(PAST_WEEK, 17);
      const response = await request(app.getHttpServer())
        .get(`/api/week-targets/${PAST_WEEK}`)
        .set(auth)
        .expect(200);
      expect(targetBody(response)).toEqual({
        weekStart: PAST_WEEK,
        targetKm: 17,
      });
    });

    it('freezes the running week under the old default when the Settings default changes (SET-6)', async () => {
      const server = app.getHttpServer();
      const profile = {
        firstName: 'Ana',
        lastName: 'Anić',
        email: 'ana@example.com',
        runningLevel: 'Beginner',
        defaultWeeklyGoalKm: 45,
      };
      // First PUT is onboarding finishing, not a default changing: it must
      // NOT materialize anything (RUN-50 may save the profile before the
      // goal, and freezing the week at the fallback would be wrong).
      await request(server).put('/api/profile').set(auth).send(profile);
      expect(await prisma.weekTarget.count()).toBe(0);

      // Changing the default freezes the running week first, server-side.
      await request(server)
        .put('/api/profile')
        .set(auth)
        .send({ ...profile, defaultWeeklyGoalKm: 50 })
        .expect(200);

      const week = await request(server)
        .get(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .expect(200);
      expect(targetBody(week).targetKm).toBe(45);
    });

    it('freezes the running week when the goal km changes and the goal is the seed (SET-6)', async () => {
      const server = app.getHttpServer();
      // No profile: goal.km is the active seed. First PUT is onboarding,
      // nothing freezes.
      await request(server)
        .put('/api/goal')
        .set(auth)
        .send({ ...validGoal(), km: 30 });
      expect(await prisma.weekTarget.count()).toBe(0);

      // Changing km freezes the running week at the old value first.
      await request(server)
        .put('/api/goal')
        .set(auth)
        .send({ ...validGoal(), km: 40 })
        .expect(200);

      const week = await request(server)
        .get(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .expect(200);
      expect(targetBody(week).targetKm).toBe(30);
    });

    it('400s a weekStart that is not a Monday, naming the right one', async () => {
      // CURRENT_WEEK + 2 days is a Wednesday.
      const response = await request(app.getHttpServer())
        .get(`/api/week-targets/${addDaysIso(CURRENT_WEEK, 2)}`)
        .set(auth)
        .expect(400);
      expect((response.body as { message: string }).message).toContain(
        CURRENT_WEEK,
      );
    });

    it('400s a weekStart that is not a real day', async () => {
      await request(app.getHttpServer())
        .get('/api/week-targets/2026-02-31')
        .set(auth)
        .expect(400);
    });
  });

  describe('PUT /api/week-targets/:weekStart (apply to weekly goal)', () => {
    it('overwrites the current week, including a week already materialized', async () => {
      const server = app.getHttpServer();
      await request(server).get(`/api/week-targets/${CURRENT_WEEK}`).set(auth);

      const response = await request(server)
        .put(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .send({ targetKm: 26 })
        .expect(200);
      expect(targetBody(response)).toEqual({
        weekStart: CURRENT_WEEK,
        targetKm: 26,
      });

      const read = await request(server)
        .get(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .expect(200);
      expect(targetBody(read).targetKm).toBe(26);
    });

    it('creates the row when applying before the week was ever displayed', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .send({ targetKm: 33 })
        .expect(200);
      expect(targetBody(response).targetKm).toBe(33);
    });

    it('accepts a coach suggestion above the 0-60 slider range', async () => {
      await request(app.getHttpServer())
        .put(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .send({ targetKm: 75 })
        .expect(200);
    });

    it('refuses to rewrite a past week (Hit/Missed history is immutable)', async () => {
      const server = app.getHttpServer();
      await plantWeekTarget(PAST_WEEK, 20);

      await request(server)
        .put(`/api/week-targets/${PAST_WEEK}`)
        .set(auth)
        .send({ targetKm: 99 })
        .expect(400);

      const read = await request(server)
        .get(`/api/week-targets/${PAST_WEEK}`)
        .set(auth)
        .expect(200);
      expect(targetBody(read).targetKm).toBe(20);
    });

    it('refuses a future week (it snapshots when it arrives)', async () => {
      await request(app.getHttpServer())
        .put(`/api/week-targets/${FUTURE_WEEK}`)
        .set(auth)
        .send({ targetKm: 30 })
        .expect(400);
    });

    it('accepts a 0 km target: the goal slider itself allows 0', async () => {
      await request(app.getHttpServer())
        .put(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .send({ targetKm: 0 })
        .expect(200);
    });

    it('400s a negative, fractional or absurd target', async () => {
      const server = app.getHttpServer();
      await request(server)
        .put(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .send({ targetKm: -1 })
        .expect(400);
      await request(server)
        .put(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .send({ targetKm: 22.5 })
        .expect(400);
      // Without the DTO ceiling this would be a Postgres int4 overflow,
      // a 500 on malformed input.
      await request(server)
        .put(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .send({ targetKm: 3000000000 })
        .expect(400);
    });
  });

  describe('GET /api/week-targets', () => {
    it("lists only this account's weeks, newest first", async () => {
      const server = app.getHttpServer();
      await plantWeekTarget(PAST_WEEK, 20);
      await request(server).get(`/api/week-targets/${CURRENT_WEEK}`).set(auth);

      const other = await signupUser(app, 'targets-other');
      await request(server).get(`/api/week-targets/${CURRENT_WEEK}`).set(other);

      const response = await request(server)
        .get('/api/week-targets')
        .set(auth)
        .expect(200);
      expect(
        (response.body as WeekTargetResponse[]).map((t) => t.weekStart),
      ).toEqual([CURRENT_WEEK, PAST_WEEK]);
    });

    it("snapshots per account: each user's first use seeds from their own goal", async () => {
      const server = app.getHttpServer();
      await request(server)
        .put('/api/goal')
        .set(auth)
        .send({ ...validGoal(), km: 30 });
      await request(server).get(`/api/week-targets/${CURRENT_WEEK}`).set(auth);

      const other = await signupUser(app, 'targets-isolated');
      const theirs = await request(server)
        .get(`/api/week-targets/${CURRENT_WEEK}`)
        .set(other)
        .expect(200);
      expect(targetBody(theirs).targetKm).toBe(20);

      const mine = await request(server)
        .get(`/api/week-targets/${CURRENT_WEEK}`)
        .set(auth)
        .expect(200);
      expect(targetBody(mine).targetKm).toBe(30);
    });
  });
});
