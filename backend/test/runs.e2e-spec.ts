import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import type { RunResponse } from './../src/runs/runs.service';
import { createE2eApp, signupUser } from './create-test-app';

// supertest types response.body as any; these two keep the assertions
// type-checked instead of sprinkling casts through every test.
function runBody(response: request.Response): RunResponse {
  return response.body as RunResponse;
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
      distanceKm: 8.2,
      durationSeconds: 2535,
      date: '2026-07-14',
      effort: 'Medium',
      note: '',
    });
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

    expect(
      (response.body as RunResponse[]).map((run) => run.routeName),
    ).toEqual(['Newer', 'Older']);
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
    expect(list.body).toEqual([]);
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

  it('rejects unknown properties instead of silently storing them', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/runs')
      .set(auth)
      .send({ ...validRun(), paceSecondsPerKm: 309 })
      .expect(400);

    expect(errorMessages(response).join(' ')).toContain('paceSecondsPerKm');
  });
});
