import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { addDaysIso, utcTodayIso } from './../src/common/dates';
import type {
  EventJoinedPayload,
  NotificationListResponse,
} from './../src/notifications/notifications.service';
import { PrismaService } from './../src/prisma/prisma.service';
import type {
  EventListResponse,
  EventParticipantListResponse,
  EventResponse,
  EventRunListResponse,
  TaggableEventListResponse,
} from './../src/events/events.service';
import { createE2eApp, signupTestUser, TestUser } from './create-test-app';

// RUN-67: the events API end to end. The tests run in order and share one
// fixture, telling the story: ana creates an event (owner + first
// participant), bruno joins it (ana gets an event-joined notification) and
// leaves again, states derive from the calendar, ana edits and finally
// deletes her event, and the delivered notification outlives all of it.
describe('Events API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ana: TestUser;
  let bruno: TestUser;
  let eventId: string;
  // The RUN-76 fixture, built by the ranking test and read by the two that
  // follow it: this suite runs in order and shares one story (see the header).
  let taggedEventId: string;
  let anaTaggedRunId: string;
  let carlaId: string;

  // Days relative to the real today: state derivation runs against the
  // server's UTC today, so fixed dates would rot. Assigned in beforeAll
  // (not at module load) to shrink the window in which a run straddling
  // UTC midnight could disagree with the server about what "today" is;
  // every state assertion also lives in the same test as its creates.
  let today: string;
  let yesterday: string;
  let tomorrow: string;

  function createEvent(user: TestUser, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/events')
      .set(user.auth)
      .send(body);
  }

  function listEvents(user: TestUser, query = '') {
    return request(app.getHttpServer())
      .get(`/api/events${query}`)
      .set(user.auth)
      .expect(200);
  }

  beforeAll(async () => {
    today = utcTodayIso();
    yesterday = addDaysIso(today, -1);
    tomorrow = addDaysIso(today, 1);
    ({ app, prisma } = await createE2eApp());
    // Users cascade to events, participants and notifications, so this
    // clears everything.
    await prisma.user.deleteMany();
    ana = await signupTestUser(app, 'event-ana');
    bruno = await signupTestUser(app, 'event-bruno');
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  it('requires a token on every endpoint', async () => {
    await request(app.getHttpServer()).get('/api/events').expect(401);
    await request(app.getHttpServer()).post('/api/events').expect(401);
    await request(app.getHttpServer()).get('/api/events/some-id').expect(401);
    await request(app.getHttpServer())
      .post('/api/events/some-id/join')
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/events/some-id/join')
      .expect(401);
    await request(app.getHttpServer()).patch('/api/events/some-id').expect(401);
    await request(app.getHttpServer())
      .delete('/api/events/some-id')
      .expect(401);
  });

  it('rejects invalid payloads: empty name, reversed dates, non-positive target (AC1)', async () => {
    await createEvent(ana, {
      name: '   ',
      startDate: today,
      endDate: tomorrow,
    }).expect(400);
    await createEvent(ana, {
      name: 'Backwards',
      startDate: tomorrow,
      endDate: today,
    }).expect(400);
    await createEvent(ana, {
      name: 'Zero target',
      startDate: today,
      endDate: tomorrow,
      targetKm: 0,
    }).expect(400);
    await createEvent(ana, {
      name: 'Impossible day',
      startDate: '2026-02-31',
      endDate: tomorrow,
    }).expect(400);
  });

  it('creates the event with the caller as owner and first participant (AC1)', async () => {
    const response = await createEvent(ana, {
      name: 'Summer 100k',
      description: 'Run 100 km together',
      startDate: today,
      endDate: tomorrow,
      targetKm: 100,
    }).expect(201);

    const body = response.body as EventResponse;
    eventId = body.id;
    expect(body).toMatchObject({
      name: 'Summer 100k',
      description: 'Run 100 km together',
      startDate: today,
      endDate: tomorrow,
      targetKm: 100,
      state: 'active',
      participantCount: 1,
      joined: true,
      mine: true,
      owner: { id: ana.id, firstName: 'event-ana', lastName: 'Tester' },
    });
  });

  it('derives upcoming, active and finished from the dates and filters by them (AC3)', async () => {
    await createEvent(ana, {
      name: 'Next week dash',
      startDate: tomorrow,
      endDate: addDaysIso(tomorrow, 7),
    }).expect(201);
    await createEvent(bruno, {
      name: 'Last month classic',
      startDate: addDaysIso(yesterday, -7),
      endDate: yesterday,
    }).expect(201);

    const all = (await listEvents(bruno)).body as EventListResponse;
    expect(all.total).toBe(3);
    // Chronological: soonest start first.
    expect(all.items.map((event) => event.name)).toEqual([
      'Last month classic',
      'Summer 100k',
      'Next week dash',
    ]);
    expect(all.items.map((event) => event.state)).toEqual([
      'finished',
      'active',
      'upcoming',
    ]);
    // joined and mine are per caller: bruno owns (and so participates in)
    // only the finished one.
    expect(all.items.map((event) => event.joined)).toEqual([
      true,
      false,
      false,
    ]);
    expect(all.items.map((event) => event.mine)).toEqual([true, false, false]);

    const active = (await listEvents(bruno, '?state=active'))
      .body as EventListResponse;
    expect(active.total).toBe(1);
    expect(active.items[0].name).toBe('Summer 100k');

    // Empty-but-present state means "not set", exactly like ?page=.
    const unfiltered = (await listEvents(bruno, '?state='))
      .body as EventListResponse;
    expect(unfiltered.total).toBe(3);

    await request(app.getHttpServer())
      .get('/api/events?state=someday')
      .set(bruno.auth)
      .expect(400);
  });

  it('lets bruno join idempotently and notifies the owner exactly once (AC2, AC4)', async () => {
    // Join answers the updated event, so the card that clicked needs no
    // follow-up read (review fix).
    const joined = (
      await request(app.getHttpServer())
        .post(`/api/events/${eventId}/join`)
        .set(bruno.auth)
        .expect(200)
    ).body as EventResponse;
    expect(joined).toMatchObject({
      id: eventId,
      joined: true,
      mine: false,
      participantCount: 2,
    });
    // The repeat join is an idempotent no-op and must not re-notify.
    const repeat = (
      await request(app.getHttpServer())
        .post(`/api/events/${eventId}/join`)
        .set(bruno.auth)
        .expect(200)
    ).body as EventResponse;
    expect(repeat).toMatchObject({ joined: true, participantCount: 2 });

    const detail = (
      await request(app.getHttpServer())
        .get(`/api/events/${eventId}`)
        .set(bruno.auth)
        .expect(200)
    ).body as EventResponse;
    expect(detail.participantCount).toBe(2);
    expect(detail.joined).toBe(true);

    const bell = (
      await request(app.getHttpServer())
        .get('/api/me/notifications')
        .set(ana.auth)
        .expect(200)
    ).body as NotificationListResponse;
    const joins = bell.items.filter((item) => item.type === 'event-joined');
    expect(joins).toHaveLength(1);
    expect(joins[0].payload).toEqual({
      joinerId: bruno.id,
      firstName: 'event-bruno',
      lastName: 'Tester',
      eventId,
      eventName: 'Summer 100k',
    } satisfies EventJoinedPayload);
  });

  it('owner joining their own event stays one participant row and never self-notifies', async () => {
    const body = (
      await request(app.getHttpServer())
        .post(`/api/events/${eventId}/join`)
        .set(ana.auth)
        .expect(200)
    ).body as EventResponse;
    expect(body).toMatchObject({
      joined: true,
      mine: true,
      participantCount: 2,
    });

    const bell = (
      await request(app.getHttpServer())
        .get('/api/me/notifications')
        .set(ana.auth)
        .expect(200)
    ).body as NotificationListResponse;
    expect(
      bell.items.filter((item) => item.type === 'event-joined'),
    ).toHaveLength(1);
  });

  it('join/leave churn cannot spam the unread bell; 404s an unknown event', async () => {
    await request(app.getHttpServer())
      .delete(`/api/events/${eventId}/join`)
      .set(bruno.auth)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/join`)
      .set(bruno.auth)
      .expect(200);

    const bell = (
      await request(app.getHttpServer())
        .get('/api/me/notifications')
        .set(ana.auth)
        .expect(200)
    ).body as NotificationListResponse;
    // Still exactly one: the unread row from the same joiner and event
    // suppressed the churned re-join's write.
    expect(
      bell.items.filter((item) => item.type === 'event-joined'),
    ).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/api/events/nonexistent/join')
      .set(bruno.auth)
      .expect(404);
    await request(app.getHttpServer())
      .delete('/api/events/nonexistent/join')
      .set(bruno.auth)
      .expect(404);
  });

  it('leave is idempotent for members; the owner cannot leave (AC2)', async () => {
    // Leave answers the updated event too (review fix; was a bare 204).
    const left = (
      await request(app.getHttpServer())
        .delete(`/api/events/${eventId}/join`)
        .set(bruno.auth)
        .expect(200)
    ).body as EventResponse;
    expect(left).toMatchObject({ joined: false, participantCount: 1 });
    // Leaving again (or an event never joined) lands in the same state.
    const again = (
      await request(app.getHttpServer())
        .delete(`/api/events/${eventId}/join`)
        .set(bruno.auth)
        .expect(200)
    ).body as EventResponse;
    expect(again).toMatchObject({ joined: false, participantCount: 1 });

    await request(app.getHttpServer())
      .delete(`/api/events/${eventId}/join`)
      .set(ana.auth)
      .expect(400);

    // Re-join so the delete-cascade test below has a participant to cascade.
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/join`)
      .set(bruno.auth)
      .expect(200);
  });

  // RUN-69: the detail page's participant list and leaderboard, against a
  // real database. The window is deliberately in the past - the runs API
  // accepts at most tomorrow, so a finished event is the only shape whose
  // day-after boundary can carry a run at all.
  it('ranks participants by their TAGGED runs and honours the leaderboard opt-out (RUN-69 AC2/AC3, RUN-76 AC3/AC4)', async () => {
    const carla = await signupTestUser(app, 'event-carla');
    carlaId = carla.id;
    const start = addDaysIso(today, -5);
    const end = addDaysIso(today, -3);

    // Owned by carla, not by ana: joins notify the OWNER, and the delivered
    // -notification assertions further down count ana's bell.
    const created = (
      await createEvent(carla, {
        name: 'Boundary week',
        startDate: start,
        endDate: end,
      }).expect(201)
    ).body as EventResponse;
    for (const user of [ana, bruno]) {
      await request(app.getHttpServer())
        .post(`/api/events/${created.id}/join`)
        .set(user.auth)
        .expect(200);
    }

    // Every account starts opted OUT (the RUN-64 default), so opting in is
    // an explicit write. There is no API for it until RUN-64 ships the
    // Settings toggle, hence the direct update.
    await prisma.user.updateMany({
      where: { id: { in: [ana.id, bruno.id] } },
      data: { showOnLeaderboard: true },
    });

    // The duration follows the distance at a flat 5:00 /km rather than
    // being a fixed half hour: since RUN-72 the API rejects an impossible
    // pace, and a 50 km run in 30 minutes is exactly that. Well inside both
    // the hard limits and the outlier thresholds, so these rows stay
    // ordinary and the board's ranking is what is under test.
    // `eventId` is what makes a run count since RUN-76; a run merely dated
    // inside the window is now an ordinary run.
    const logRun = (
      user: TestUser,
      date: string,
      distanceKm: number,
      tagged: string | null = null,
    ) =>
      request(app.getHttpServer())
        .post('/api/runs')
        .set(user.auth)
        .send({
          routeName: 'Loop',
          distanceKm,
          durationSeconds: Math.round(distanceKm * 300),
          date,
          ...(tagged !== null && { eventId: tagged }),
        });

    // ana tags runs on both boundary days, which is what the inclusive window
    // means: 5 + 3 = 8 km over 2 runs.
    const anaFirst = (await logRun(ana, start, 5, created.id).expect(201))
      .body as { id: string };
    await logRun(ana, end, 3, created.id).expect(201);
    // Inside the window but UNTAGGED, and this is the behaviour change: before
    // RUN-76 this 10 km counted simply for being in the window, and now it does
    // not. Nothing else in the suite proves that as directly.
    await logRun(ana, addDaysIso(start, 1), 10).expect(201);
    await logRun(bruno, addDaysIso(start, 1), 12, created.id).expect(201);
    // carla out-runs everyone and still must not appear on the board.
    await logRun(carla, addDaysIso(start, 1), 50, created.id).expect(201);

    // RUN-76 AC3, and deliberately over HTTP with no form in sight: both server
    // rules reject and store nothing.
    const outsideWindow = await logRun(
      ana,
      addDaysIso(start, -1),
      10,
      created.id,
    ).expect(400);
    expect(JSON.stringify(outsideWindow.body)).toContain('Boundary week');
    const dora = await signupTestUser(app, 'event-dora');
    await logRun(dora, start, 4, created.id).expect(400);
    // Nothing was stored by either rejection. The runs list is paginated since
    // RUN-79, so the rows are in the envelope.
    const doraRuns = (
      await request(app.getHttpServer())
        .get('/api/runs')
        .set(dora.auth)
        .expect(200)
    ).body as { items: unknown[]; total: number };
    expect(doraRuns).toMatchObject({ items: [], total: 0 });
    taggedEventId = created.id;
    anaTaggedRunId = anaFirst.id;

    const body = (
      await request(app.getHttpServer())
        .get(`/api/events/${created.id}/participants`)
        .set(ana.auth)
        .expect(200)
    ).body as EventParticipantListResponse;

    expect(body.total).toBe(3);
    // Join order (AC1): the owner is first, having joined at creation. The
    // other two are asserted by id rather than by position - their joins
    // are milliseconds apart, and pinning that ordering would buy a flake
    // instead of a guarantee.
    expect(body.items[0]).toMatchObject({
      id: carla.id,
      // Opted out: in the list, off the board, and none of her numbers
      // leave the server (AC3).
      rank: null,
      totalKm: null,
      runCount: null,
      // RUN-72's marker is one of those numbers, so it is withheld too.
      unverified: null,
    });
    const byId = new Map(body.items.map((row) => [row.id, row]));
    expect(byId.get(ana.id)).toMatchObject({
      me: true,
      rank: 2,
      totalKm: 8,
      runCount: 2,
    });
    expect(byId.get(bruno.id)).toMatchObject({
      me: false,
      rank: 1,
      totalKm: 12,
      runCount: 1,
    });

    await request(app.getHttpServer())
      .get('/api/events/nonexistent/participants')
      .set(ana.auth)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/events/${created.id}/participants`)
      .expect(401);
  });

  // RUN-76 AC2 and AC6, reading the same fixture the ranking test built: the
  // feed lists what is tagged, and untagging or deleting a run moves both the
  // feed and the board on the next read.
  it('lists the event’s tagged runs, and untagging or deleting one moves both reads (RUN-76 AC2, AC6)', async () => {
    const feed = () =>
      request(app.getHttpServer())
        .get(`/api/events/${taggedEventId}/runs`)
        .set(ana.auth)
        .expect(200)
        .then((response) => response.body as EventRunListResponse);
    const standing = () =>
      request(app.getHttpServer())
        .get(`/api/events/${taggedEventId}/participants`)
        .set(ana.auth)
        .expect(200)
        .then((response) => {
          const body = response.body as EventParticipantListResponse;
          return body.items.find((row) => row.id === ana.id);
        });

    const before = await feed();
    // ana's two tagged runs and bruno's one. NOT ana's untagged 10 km inside
    // the window, and not carla's 50 km - she is off leaderboards, and a feed
    // of her rows would rebuild exactly the total the board withholds.
    expect(before.total).toBe(3);
    expect(before.items.every((row) => row.runner.id !== carlaId)).toBe(true);
    expect(
      before.items.map((row) => row.distanceKm).sort((a, b) => a - b),
    ).toEqual([3, 5, 12]);
    // Newest first, the order every run list in this app uses.
    expect(before.items.map((row) => row.date)).toEqual(
      [...before.items.map((row) => row.date)].sort().reverse(),
    );
    expect(before.items[0].runner).toMatchObject({ lastName: 'Tester' });

    // Untag: the run survives as an ordinary run, and both event reads drop it.
    await request(app.getHttpServer())
      .patch(`/api/runs/${anaTaggedRunId}`)
      .set(ana.auth)
      .send({ eventId: null })
      .expect(200);
    expect((await feed()).total).toBe(2);
    expect(await standing()).toMatchObject({ totalKm: 3, runCount: 1 });

    // Delete the other one: ana keeps her place with nothing on it.
    const remaining = (await feed()).items.find(
      (row) => row.runner.id === ana.id,
    );
    await request(app.getHttpServer())
      .delete(`/api/runs/${remaining?.id}`)
      .set(ana.auth)
      .expect(204);
    expect((await feed()).total).toBe(1);
    expect(await standing()).toMatchObject({ totalKm: 0, runCount: 0 });

    await request(app.getHttpServer())
      .get(`/api/events/${taggedEventId}/runs`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/events/nonexistent/runs')
      .set(ana.auth)
      .expect(404);
  });

  // RUN-76 AC1: the picker's options are exactly what the write path accepts.
  it('lists only the caller’s own events covering the given day (RUN-76 AC1)', async () => {
    const taggable = (user: TestUser, date: string) =>
      request(app.getHttpServer())
        .get(`/api/events/taggable?date=${date}`)
        .set(user.auth)
        .expect(200)
        .then((response) => response.body as TaggableEventListResponse);

    const start = addDaysIso(today, -5);
    const inside = await taggable(ana, start);
    expect(inside.items.map((row) => row.id)).toContain(taggedEventId);
    // The picker needs a label and the window; nothing else is served.
    expect(Object.keys(inside.items[0]).sort()).toEqual([
      'endDate',
      'id',
      'name',
      'startDate',
    ]);

    // A day the event does not cover, and a runner who never joined it: both
    // are empty answers rather than errors, and both match the rule the run
    // POST enforces.
    expect(
      (await taggable(ana, addDaysIso(start, -1))).items.map((row) => row.id),
    ).not.toContain(taggedEventId);
    const dora = await signupTestUser(app, 'taggable-dora');
    expect((await taggable(dora, start)).items).toEqual([]);

    // A missing or nonsensical date is a 400, not today's answer for a run
    // dated last week.
    await request(app.getHttpServer())
      .get('/api/events/taggable')
      .set(ana.auth)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/events/taggable?date=2026-02-31')
      .set(ana.auth)
      .expect(400);
  });

  it('PATCH updates the owner event; non-owners get 404, never 403 (AC5)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/events/${eventId}`)
      .set(bruno.auth)
      .send({ name: 'Hijacked' })
      .expect(404);

    // Moving only the start past the stored end fails on the merged pair.
    await request(app.getHttpServer())
      .patch(`/api/events/${eventId}`)
      .set(ana.auth)
      .send({ startDate: addDaysIso(tomorrow, 1) })
      .expect(400);

    const updated = (
      await request(app.getHttpServer())
        .patch(`/api/events/${eventId}`)
        .set(ana.auth)
        .send({ name: 'Summer 120k', targetKm: 120 })
        .expect(200)
    ).body as EventResponse;
    expect(updated.name).toBe('Summer 120k');
    expect(updated.targetKm).toBe(120);
    expect(updated.participantCount).toBe(2);

    await request(app.getHttpServer())
      .patch(`/api/events/${eventId}`)
      .set(ana.auth)
      .send({ sort: 'asc' })
      .expect(400);
  });

  it('DELETE removes the owner event, cascades participants, and the notification survives (AC5)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/events/${eventId}`)
      .set(bruno.auth)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/events/${eventId}`)
      .set(ana.auth)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .set(ana.auth)
      .expect(404);
    const participants = await prisma.eventParticipant.count({
      where: { eventId },
    });
    expect(participants).toBe(0);

    // The delivered event-joined notification keeps rendering: its payload
    // is a snapshot (RUN-65 AC4), so the event's deletion cannot break it.
    const bell = (
      await request(app.getHttpServer())
        .get('/api/me/notifications')
        .set(ana.auth)
        .expect(200)
    ).body as NotificationListResponse;
    const join = bell.items.find((item) => item.type === 'event-joined');
    expect(join).toBeDefined();
    expect((join?.payload as EventJoinedPayload).eventName).toBe('Summer 100k');
  });
});
