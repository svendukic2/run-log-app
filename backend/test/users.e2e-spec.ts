import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import type { UserSearchResponse } from './../src/users/users.service';
import { createE2eApp, signupTestUser, TestUser } from './create-test-app';

// RUN-62: the user search end to end. Deliberately short, because the
// service spec already covers the shapes; what only a real database can
// prove is the one thing a mock cannot - that `mode: 'insensitive'` really
// is case-insensitive in Postgres, and that GET /api/users resolves to the
// search rather than to a profile whose id is empty.
describe('User search API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ana: TestUser;
  let bruno: TestUser;

  function search(user: TestUser, query: string) {
    return request(app.getHttpServer())
      .get(`/api/users${query}`)
      .set(user.auth)
      .expect(200);
  }

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());

    await prisma.user.deleteMany();
    // signupTestUser names them `<name> Tester`, so "sea" hits the first
    // name and "test" the last.
    ana = await signupTestUser(app, 'search-ana');
    bruno = await signupTestUser(app, 'search-bruno');
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  it('requires a token', async () => {
    await request(app.getHttpServer()).get('/api/users?search=ana').expect(401);
  });

  it('matches either name whatever the casing, and never the caller (AC1)', async () => {
    // Upper case against lower-cased rows, and a second term matched
    // against the OTHER half of the name.
    const response = await search(bruno, '?search=SEARCH-ANA%20tes');
    const body = response.body as UserSearchResponse;

    expect(body.items).toEqual([
      {
        id: ana.id,
        firstName: 'search-ana',
        lastName: 'Tester',
        following: false,
      },
    ]);
    expect(body.total).toBe(1);

    // "tester" matches both accounts, but the caller is never one of the
    // rows: you cannot follow yourself.
    const both = await search(bruno, '?search=TESTER');
    const bothBody = both.body as UserSearchResponse;
    expect(bothBody.items.map((item) => item.id)).toEqual([ana.id]);
  });

  it('answers the empty query with the caller counts and no rows (AC3)', async () => {
    await request(app.getHttpServer())
      .post(`/api/users/${ana.id}/follow`)
      .set(bruno.auth)
      .expect(200);

    const response = await search(bruno, '');
    const body = response.body as UserSearchResponse;

    expect(body.items).toEqual([]);
    expect(body.counts).toEqual({ followers: 0, following: 1 });

    // And the follow state now rides along on the matching row (AC2).
    const matched = await search(bruno, '?search=search-ana');
    expect((matched.body as UserSearchResponse).items[0].following).toBe(true);
  });

  // Review fix, and the one case only a real LIKE can settle: Prisma does
  // not escape wildcards inside `contains`, so an unstripped '%' would list
  // every account here.
  it('treats a bare LIKE wildcard as no query at all', async () => {
    const response = await search(bruno, '?search=%25');

    expect((response.body as UserSearchResponse).items).toEqual([]);
  });

  it('rejects an unknown query param like every other list', async () => {
    await request(app.getHttpServer())
      .get('/api/users?nope=1')
      .set(bruno.auth)
      .expect(400);
  });
});
