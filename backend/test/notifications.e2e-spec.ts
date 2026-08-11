import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import type {
  FollowedRanPayload,
  NewFollowerPayload,
  NotificationListResponse,
  NotificationResponse,
} from './../src/notifications/notifications.service';
import { createE2eApp, signupTestUser, TestUser } from './create-test-app';

// RUN-65: the notifications API end to end. The tests run in order and share
// one fixture, telling the story: bruno and carla follow ana (ana gets
// new-follower notifications), ana logs a run (both get followed-ran), the
// bell is read and marked, and finally the actors' rows disappear while the
// notifications keep rendering.
describe('Notifications API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ana: TestUser;
  let bruno: TestUser;
  let carla: TestUser;
  let anaRunId: string;

  function notificationsOf(user: TestUser, query = '') {
    return request(app.getHttpServer())
      .get(`/api/me/notifications${query}`)
      .set(user.auth)
      .expect(200);
  }

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());

    // Users cascade to follows, runs and notifications (schema-level), so
    // this clears everything.
    await prisma.user.deleteMany();
    ana = await signupTestUser(app, 'notif-ana');
    bruno = await signupTestUser(app, 'notif-bruno');
    carla = await signupTestUser(app, 'notif-carla');
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  it('requires a token on all three endpoints', async () => {
    await request(app.getHttpServer()).get('/api/me/notifications').expect(401);
    await request(app.getHttpServer())
      .post('/api/me/notifications/some-id/read')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/me/notifications/read-all')
      .expect(401);
  });

  it('starts with an empty bell', async () => {
    const body = (await notificationsOf(ana)).body as NotificationListResponse;
    expect(body).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      unreadCount: 0,
    });
  });

  it('delivers one new-follower notification per follow with the follower snapshot (AC1)', async () => {
    await request(app.getHttpServer())
      .post(`/api/users/${ana.id}/follow`)
      .set(bruno.auth)
      .expect(200);
    // The repeat follow is an idempotent no-op and must not re-notify.
    await request(app.getHttpServer())
      .post(`/api/users/${ana.id}/follow`)
      .set(bruno.auth)
      .expect(200);

    const body = (await notificationsOf(ana)).body as NotificationListResponse;
    expect(body.total).toBe(1);
    expect(body.unreadCount).toBe(1);
    const item = body.items[0];
    expect(item.type).toBe('new-follower');
    expect(item.readAt).toBeNull();
    expect(item.payload).toEqual({
      followerId: bruno.id,
      firstName: 'notif-bruno',
      lastName: 'Tester',
    } satisfies NewFollowerPayload);

    // The follower's own bell is untouched: notifications go to the followee.
    const brunos = (await notificationsOf(bruno))
      .body as NotificationListResponse;
    expect(brunos.total).toBe(0);
  });

  it('fans a logged run out to every follower with the run snapshot (AC2)', async () => {
    // Complete the fixture: carla also follows ana.
    await request(app.getHttpServer())
      .post(`/api/users/${ana.id}/follow`)
      .set(carla.auth)
      .expect(200);

    const created = await request(app.getHttpServer())
      .post('/api/runs')
      .set(ana.auth)
      .send({
        routeName: 'River loop',
        distanceKm: 10.5,
        durationSeconds: 3600,
        date: '2026-08-10',
        effort: 'Hard',
      })
      .expect(201);
    anaRunId = (created.body as { id: string }).id;

    const expectedPayload: FollowedRanPayload = {
      runnerId: ana.id,
      firstName: 'notif-ana',
      lastName: 'Tester',
      runId: anaRunId,
      routeName: 'River loop',
      distanceKm: 10.5,
      durationSeconds: 3600,
      date: '2026-08-10',
    };
    // Both followers got exactly one, with the headline stats inline.
    for (const follower of [bruno, carla]) {
      const body = (await notificationsOf(follower))
        .body as NotificationListResponse;
      const ranItems = body.items.filter((i) => i.type === 'followed-ran');
      expect(ranItems).toHaveLength(1);
      expect(ranItems[0].payload).toEqual(expectedPayload);
    }

    // The runner notifies followers, never herself.
    const anas = (await notificationsOf(ana)).body as NotificationListResponse;
    expect(anas.items.map((i) => i.type)).toEqual([
      'new-follower',
      'new-follower',
    ]);
  });

  it('pages newest first with totals and unread count (AC3)', async () => {
    // Ana's bell now holds two new-follower rows: carla's follow is newer.
    const page1 = (await notificationsOf(ana, '?page=1&pageSize=1'))
      .body as NotificationListResponse;
    expect(page1.total).toBe(2);
    expect(page1.unreadCount).toBe(2);
    expect(page1.items).toHaveLength(1);
    expect((page1.items[0].payload as NewFollowerPayload).followerId).toBe(
      carla.id,
    );

    const page2 = (await notificationsOf(ana, '?page=2&pageSize=1'))
      .body as NotificationListResponse;
    expect((page2.items[0].payload as NewFollowerPayload).followerId).toBe(
      bruno.id,
    );
  });

  it('rejects unknown query params like every other endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/me/notifications?sort=asc')
      .set(ana.auth)
      .expect(400);
  });

  it('marks one read idempotently and scopes the id to the owner (AC3)', async () => {
    const bell = (await notificationsOf(ana)).body as NotificationListResponse;
    const target = bell.items[0];

    const first = await request(app.getHttpServer())
      .post(`/api/me/notifications/${target.id}/read`)
      .set(ana.auth)
      .expect(200);
    const firstRead = (first.body as NotificationResponse).readAt;
    expect(firstRead).not.toBeNull();

    // The repeat answers the same row with the original timestamp.
    const second = await request(app.getHttpServer())
      .post(`/api/me/notifications/${target.id}/read`)
      .set(ana.auth)
      .expect(200);
    expect((second.body as NotificationResponse).readAt).toBe(firstRead);

    const after = (await notificationsOf(ana)).body as NotificationListResponse;
    expect(after.unreadCount).toBe(1);

    // Someone else's notification id answers 404, exactly like a bad id.
    await request(app.getHttpServer())
      .post(`/api/me/notifications/${target.id}/read`)
      .set(bruno.auth)
      .expect(404);
  });

  it('marks everything read in one call (AC3)', async () => {
    await request(app.getHttpServer())
      .post('/api/me/notifications/read-all')
      .set(ana.auth)
      .expect(200)
      .expect({ updated: 1 });

    const after = (await notificationsOf(ana)).body as NotificationListResponse;
    expect(after.unreadCount).toBe(0);
    expect(after.total).toBe(2);

    // Nothing left unread: the repeat flips zero rows.
    await request(app.getHttpServer())
      .post('/api/me/notifications/read-all')
      .set(ana.auth)
      .expect(200)
      .expect({ updated: 0 });
  });

  it('keeps rendering after the actor deletes the run and unfollows (AC4)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/runs/${anaRunId}`)
      .set(ana.auth)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/users/${ana.id}/follow`)
      .set(bruno.auth)
      .expect(204);

    // Bruno's followed-ran notification survives both, payload intact.
    const bell = (await notificationsOf(bruno))
      .body as NotificationListResponse;
    const ran = bell.items.find((i) => i.type === 'followed-ran');
    expect(ran).toBeDefined();
    expect((ran?.payload as FollowedRanPayload).routeName).toBe('River loop');
    expect((ran?.payload as FollowedRanPayload).runId).toBe(anaRunId);
  });

  it('deletes the bell with its owner (cascade), not with the actors', async () => {
    // Carla still has one followed-ran row from ana; deleting CARLA removes
    // it, proving the rows hang off the recipient.
    await prisma.user.delete({ where: { id: carla.id } });
    const rows = await prisma.notification.count({
      where: { userId: carla.id },
    });
    expect(rows).toBe(0);
  });
});
