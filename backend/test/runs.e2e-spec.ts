import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import type { RunListResponse, RunResponse } from './../src/runs/runs.service';
import { createE2eApp, signupUser } from './create-test-app';

// supertest types response.body as any; these three keep the assertions
// type-checked instead of sprinkling casts through every test.
function runBody(response: request.Response): RunResponse {
  return response.body as RunResponse;
}

// GET /api/runs answers the shared pagination envelope since RUN-79.
function listBody(response: request.Response): RunListResponse {
  return response.body as RunListResponse;
}

function errorMessages(response: request.Response): string[] {
  const { message } = response.body as { message: string | string[] };
  return Array.isArray(message) ? message : [message];
}

// Full-path CRUD against the real database (CI provides Postgres as a
// service container). Protected by the global JwtAuthGuard since RUN-57,
// so the suite signs up one user in beforeAll and sends every request as
// them. Each test starts from an empty Run table; the user survives the
// whole file. Cross-user isolation has its own spec (user-isolation).
describe('Runs API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: { Authorization: string };

  function validRun() {
    return {
      routeName: 'Morning loop',
      distanceKm: 8.2,
      durationSeconds: 2535,
      date: '2026-07-14',
      effort: 'Medium',
      note: '',
    };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());

    // Users cascade to runs, so this also clears any leftover rows.
    await prisma.user.deleteMany();
    auth = await signupUser(app, 'runner');
  });

  beforeEach(async () => {
    await prisma.run.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  it('401s every runs endpoint without a token (RUN-57 AC1)', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/runs').expect(401);
    await request(server).post('/api/runs').send(validRun()).expect(401);
    await request(server).get('/api/runs/some-id').expect(401);
    await request(server)
      .patch('/api/runs/some-id')
      .send({ distanceKm: 5 })
      .expect(401);
    await request(server).delete('/api/runs/some-id').expect(401);
  });

  it('creates a run and returns the contract shape (AC1, AC4)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send(validRun())
      .expect(201);

    // Exactly the Run type from docs/data-model.md: string id, yyyy-mm-dd
    // date, integer seconds, nothing derived and nothing extra - the
    // owning userId stays internal.
    expect(response.body).toEqual({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any is typed any
      id: expect.any(String),
      routeName: 'Morning loop',
      // A plain JSON number even though the column is NUMERIC(5, 2) since
      // RUN-78: this is the assertion that would catch a Decimal escaping the
      // backend boundary, because toEqual against 8.2 fails on {s, e, d}.
      distanceKm: 8.2,
      durationSeconds: 2535,
      date: '2026-07-14',
      // When the run was LOGGED, an ISO instant, unlike `date` above which is
      // the calendar day it was run on (RUN-78).
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any is typed any
      createdAt: expect.any(String),
      effort: 'Medium',
      note: '',
      // Present and null on every run: this one was saved without opening the
      // Route step (RUN-54 AC3).
      route: null,
      // Untagged, like every run this suite logs: tagging one to an event
      // needs an event and a membership, so it lives in events.e2e-spec.ts
      // (RUN-76 AC3) next to the fixture that can build both.
      eventId: null,
    });
  });

  it('orders same-day runs by when they were logged, newest first (AC4)', async () => {
    // The gap RUN-78 closed: before createdAt, two runs on one calendar day
    // were ordered by cuid, which is deterministic but arbitrary - so the
    // run entered second could come back either side of the first. Sending
    // them in a known order and reading them back reversed is the whole
    // check, and it is an e2e test rather than a unit one because what is
    // being proved is that the DATABASE sorts this way.
    const server = app.getHttpServer();
    for (const routeName of ['First', 'Second', 'Third']) {
      await request(server)
        .post('/api/runs')
        .set(auth)
        .send({ ...validRun(), routeName })
        .expect(201);
    }

    const response = await request(server)
      .get('/api/runs')
      .set(auth)
      .expect(200);

    expect(listBody(response).items.map((run) => run.routeName)).toEqual([
      'Third',
      'Second',
      'First',
    ]);
  });

  it('defaults effort and note when the payload omits them (ADD-8)', async () => {
    const { effort, note, ...withoutOptionals } = validRun();
    void effort;
    void note;
    const response = await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send(withoutOptionals)
      .expect(201);

    expect(runBody(response).effort).toBe('Medium');
    expect(runBody(response).note).toBe('');
  });

  it('lists runs newest first (AC1)', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/runs')
      .set(auth)
      .send({ ...validRun(), routeName: 'Older', date: '2026-07-01' })
      .expect(201);
    await request(server)
      .post('/api/runs')
      .set(auth)
      .send({ ...validRun(), routeName: 'Newer', date: '2026-07-10' })
      .expect(201);

    const response = await request(server)
      .get('/api/runs')
      .set(auth)
      .expect(200);

    expect(listBody(response).items.map((run) => run.routeName)).toEqual([
      'Newer',
      'Older',
    ]);
    expect(listBody(response)).toMatchObject({ total: 2, page: 1 });

    // RUN-79, against real skip/take: a page is a window on that same
    // ordering, and `total` still counts everything behind it - which is
    // what lets the store walk to the end instead of stopping at what one
    // request happened to return.
    const secondPage = await request(server)
      .get('/api/runs?page=2&pageSize=1')
      .set(auth)
      .expect(200);

    expect(listBody(secondPage).items.map((run) => run.routeName)).toEqual([
      'Older',
    ]);
    expect(listBody(secondPage)).toMatchObject({
      total: 2,
      page: 2,
      pageSize: 1,
    });
  });

  it('round-trips one run through GET /api/runs/:id', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send(validRun())
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/runs/${runBody(created).id}`)
      .set(auth)
      .expect(200);

    expect(response.body).toEqual(created.body);
  });

  it('patches a subset of fields and keeps the rest (AC1)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send(validRun())
      .expect(201);

    const response = await request(app.getHttpServer())
      .patch(`/api/runs/${runBody(created).id}`)
      .set(auth)
      .send({ distanceKm: 10.5, note: 'felt strong' })
      .expect(200);

    expect(response.body).toEqual({
      ...created.body,
      distanceKm: 10.5,
      note: 'felt strong',
    });
  });

  it('deletes a run and the list reflects it (AC1)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send(validRun())
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/runs/${runBody(created).id}`)
      .set(auth)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/runs/${runBody(created).id}`)
      .set(auth)
      .expect(404);
    const list = await request(app.getHttpServer())
      .get('/api/runs')
      .set(auth)
      .expect(200);
    expect(listBody(list).items).toEqual([]);
    expect(listBody(list).total).toBe(0);
  });

  it('404s with a message on a missing id for GET, PATCH and DELETE', async () => {
    const server = app.getHttpServer();
    const missing = await request(server)
      .get('/api/runs/nope')
      .set(auth)
      .expect(404);
    expect(errorMessages(missing).join(' ')).toContain('nope');
    await request(server)
      .patch('/api/runs/nope')
      .set(auth)
      .send({ distanceKm: 5 })
      .expect(404);
    await request(server).delete('/api/runs/nope').set(auth).expect(404);
  });

  it('rejects invalid payloads with 400 and field-level messages (AC2)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send({
        routeName: '',
        distanceKm: 0,
        durationSeconds: -5,
        date: '14-07-2026',
        effort: 'Sprinting',
      })
      .expect(400);

    expect(errorMessages(response)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('routeName'),
        expect.stringContaining('distanceKm'),
        expect.stringContaining('durationSeconds'),
        expect.stringContaining('date'),
        expect.stringContaining('effort'),
      ]),
    );
  });

  it('rejects explicit nulls in a PATCH with 400, never a 500 (AC2)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send(validRun())
      .expect(201);

    // The whole point of UpdateRunDto's skipNullProperties: false - a null
    // must die in validation, not reach the NOT NULL column as a 500.
    for (const field of [
      'routeName',
      'distanceKm',
      'durationSeconds',
      'date',
      'effort',
      'note',
    ]) {
      const response = await request(app.getHttpServer())
        .patch(`/api/runs/${runBody(created).id}`)
        .set(auth)
        .send({ [field]: null })
        .expect(400);
      expect(errorMessages(response).join(' ')).toContain(field);
    }
  });

  it('rejects a whitespace-only routeName (trimmed before validation)', async () => {
    await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send({ ...validRun(), routeName: '   ' })
      .expect(400);
  });

  it('rejects a future date (RUN-23 AC7) and an impossible calendar day', async () => {
    await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send({ ...validRun(), date: '2999-01-01' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send({ ...validRun(), date: '2026-02-31' })
      .expect(400);
  });

  // The optional route (RUN-54). Only a booted app on the real database proves
  // these three: JSONB survives a round-trip as the same list of points, the
  // server stamps the source rather than trusting the client, and the
  // all-or-none CHECK is actually on the table.
  it('round-trips a drawn route and clears it on an explicit null (AC4, AC5)', async () => {
    const route = {
      polyline: 'wap_IsyspAsFgc@cG{h@qFe{A',
      waypoints: [
        { lat: 52.516275, lng: 13.377704 },
        { lat: 52.518611, lng: 13.388889 },
        { lat: 52.520008, lng: 13.404954 },
      ],
    };

    const created = await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send({ ...validRun(), route })
      .expect(201);

    expect(runBody(created).route).toEqual({
      ...route,
      // Server-assigned: the client never sends a source, and the whitelist
      // pipe rejects it if it tries (see below).
      source: 'openrouteservice',
      // Your own runs are never trimmed (RUN-55 AC3); the ~300 m privacy trim
      // applies to what a public profile serves a stranger.
      trimmed: false,
    });

    // The stored row reads back identically, points in the same order - the
    // ordering is what tells Start from Finish.
    const reread = await request(app.getHttpServer())
      .get(`/api/runs/${runBody(created).id}`)
      .set(auth)
      .expect(200);
    expect(runBody(reread).route).toEqual(runBody(created).route);

    // A PATCH that says nothing about the route keeps it: an edit that never
    // opened the map must not wipe it.
    const renamed = await request(app.getHttpServer())
      .patch(`/api/runs/${runBody(created).id}`)
      .set(auth)
      .send({ routeName: 'Evening tempo' })
      .expect(200);
    expect(runBody(renamed).route).toEqual(runBody(created).route);

    // An explicit null removes it - the Clear button's other half.
    const cleared = await request(app.getHttpServer())
      .patch(`/api/runs/${runBody(created).id}`)
      .set(auth)
      .send({ route: null })
      .expect(200);
    expect(runBody(cleared).route).toBeNull();
  });

  it('rejects a route the picker could not have produced (AC4)', async () => {
    const server = app.getHttpServer();
    // One point is not a route.
    await request(server)
      .post('/api/runs')
      .set(auth)
      .send({
        ...validRun(),
        route: { polyline: 'abc', waypoints: [{ lat: 52, lng: 13 }] },
      })
      .expect(400);
    // A client-asserted provenance is not a thing: source is the server's.
    await request(server)
      .post('/api/runs')
      .set(auth)
      .send({
        ...validRun(),
        route: {
          polyline: 'abc',
          waypoints: [
            { lat: 52, lng: 13 },
            { lat: 53, lng: 14 },
          ],
          source: 'gps',
        },
      })
      .expect(400);
  });

  it('rejects unknown properties instead of silently storing them', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send({ ...validRun(), paceSecondsPerKm: 309 })
      .expect(400);

    expect(errorMessages(response).join(' ')).toContain('paceSecondsPerKm');
  });
});
