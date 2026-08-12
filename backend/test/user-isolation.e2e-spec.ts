import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import type { RunListResponse, RunResponse } from './../src/runs/runs.service';
import { createE2eApp, E2E_PASSWORD, signupUser } from './create-test-app';

// RUN-57 AC5: two registered users, complete data isolation between them.
// This spec is the proof the whole task exists for, so it exercises every
// verb of the runs API across the ownership boundary.
describe('User data isolation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authA: { Authorization: string };
  let authB: { Authorization: string };
  let runOfB: string;

  function run(routeName: string) {
    return {
      routeName,
      distanceKm: 5,
      durationSeconds: 1800,
      date: '2026-07-14',
    };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());

    // Users cascade to runs (schema-level), so this clears everything.
    await prisma.user.deleteMany();
    authA = await signupUser(app, 'ana');
    authB = await signupUser(app, 'bruno');

    // A owns two runs, B owns one: the fixture every test reads.
    await request(app.getHttpServer())
      .post('/api/runs')
      .set(authA)
      .send(run('A first'))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/runs')
      .set(authA)
      .send(run('A second'))
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/api/runs')
      .set(authB)
      .send(run('B only'))
      .expect(201);
    runOfB = (created.body as RunResponse).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  it('each user lists exactly their own runs and nothing else (AC2, AC5)', async () => {
    const listA = await request(app.getHttpServer())
      .get('/api/runs')
      .set(authA)
      .expect(200);
    const listB = await request(app.getHttpServer())
      .get('/api/runs')
      .set(authB)
      .expect(200);

    expect(
      (listA.body as RunListResponse).items.map((r) => r.routeName).sort(),
    ).toEqual(['A first', 'A second']);
    expect(
      (listB.body as RunListResponse).items.map((r) => r.routeName),
    ).toEqual(['B only']);
    // The count is scoped too: a total that counted every run in the table
    // would tell A exactly how many runs B has logged.
    expect((listA.body as RunListResponse).total).toBe(2);
    expect((listB.body as RunListResponse).total).toBe(1);
  });

  it("404s A reading, patching and deleting B's run, without confirming it exists (AC3)", async () => {
    await request(app.getHttpServer())
      .get(`/api/runs/${runOfB}`)
      .set(authA)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/runs/${runOfB}`)
      .set(authA)
      .send({ distanceKm: 1 })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/runs/${runOfB}`)
      .set(authA)
      .expect(404);

    // The attempts above changed nothing: B still sees the run untouched.
    const response = await request(app.getHttpServer())
      .get(`/api/runs/${runOfB}`)
      .set(authB)
      .expect(200);
    expect((response.body as RunResponse).distanceKm).toBe(5);
  });

  it("an empty PATCH also 404s on another user's run (the no-op read path is scoped too)", async () => {
    await request(app.getHttpServer())
      .patch(`/api/runs/${runOfB}`)
      .set(authA)
      .send({})
      .expect(404);
  });

  it('the public endpoints stay public and the protected ones stay closed (AC1)', async () => {
    await request(app.getHttpServer()).get('/api/hello').expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: E2E_PASSWORD })
      .expect(200);
    await request(app.getHttpServer()).get('/api/runs').expect(401);
  });

  it('a token from a deleted user is rejected by scoping, not trusted (defense in depth)', async () => {
    const authC = await signupUser(app, 'casper');
    await prisma.user.delete({ where: { email: 'casper@example.com' } });

    // The JWT itself still verifies (it is signed and unexpired), but every
    // read is scoped to a userId that no longer owns anything, so nothing
    // leaks to a ghost session.
    const list = await request(app.getHttpServer())
      .get('/api/runs')
      .set(authC)
      .expect(200);
    expect((list.body as RunListResponse).items).toEqual([]);
    await request(app.getHttpServer())
      .get(`/api/runs/${runOfB}`)
      .set(authC)
      .expect(404);

    // Writes hit the userId foreign key instead of inventing orphan rows:
    // a dead session answers 401, not a 500 (P2003 mapping in create).
    await request(app.getHttpServer())
      .post('/api/runs')
      .set(authC)
      .send(run('ghost run'))
      .expect(401);
  });
});
