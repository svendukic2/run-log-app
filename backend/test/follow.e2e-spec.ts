import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import type { FollowListResponse } from './../src/follow/follow.service';
import { createE2eApp, signupTestUser, TestUser } from './create-test-app';

// RUN-61: the follow API end to end. The tests in this file run in order and
// share one fixture, telling the story: ana follows bruno and carla, bruno
// follows ana back, then ana unfollows bruno and carla's account disappears.
describe('Follow API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ana: TestUser;
  let bruno: TestUser;
  let carla: TestUser;

  function followingOf(user: TestUser, query = '') {
    return request(app.getHttpServer())
      .get(`/api/me/following${query}`)
      .set(user.auth)
      .expect(200);
  }

  function followersOf(user: TestUser, query = '') {
    return request(app.getHttpServer())
      .get(`/api/me/followers${query}`)
      .set(user.auth)
      .expect(200);
  }

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());

    // Users cascade to follow rows (schema-level), so this clears everything.
    await prisma.user.deleteMany();
    ana = await signupTestUser(app, 'follow-ana');
    bruno = await signupTestUser(app, 'follow-bruno');
    carla = await signupTestUser(app, 'follow-carla');
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  it('requires a token on all four endpoints', async () => {
    await request(app.getHttpServer())
      .post(`/api/users/${bruno.id}/follow`)
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/users/${bruno.id}/follow`)
      .expect(401);
    await request(app.getHttpServer()).get('/api/me/followers').expect(401);
    await request(app.getHttpServer()).get('/api/me/following').expect(401);
  });

  it('creates a follow row and repeating it is a no-op (AC1)', async () => {
    await request(app.getHttpServer())
      .post(`/api/users/${bruno.id}/follow`)
      .set(ana.auth)
      .expect(200)
      .expect({ following: true });

    // The repeat answers identically and adds nothing.
    await request(app.getHttpServer())
      .post(`/api/users/${bruno.id}/follow`)
      .set(ana.auth)
      .expect(200)
      .expect({ following: true });

    const rows = await prisma.follow.count({
      where: { followerId: ana.id, followeeId: bruno.id },
    });
    expect(rows).toBe(1);
  });

  it('rejects following yourself with 400 (AC1)', async () => {
    await request(app.getHttpServer())
      .post(`/api/users/${ana.id}/follow`)
      .set(ana.auth)
      .expect(400);
  });

  it('404s a follow of a user that does not exist', async () => {
    await request(app.getHttpServer())
      .post('/api/users/no-such-user-id/follow')
      .set(ana.auth)
      .expect(404);
  });

  it('lists following and followers with names, states and counts (AC3)', async () => {
    // Finish the fixture: ana also follows carla; bruno follows ana back.
    await request(app.getHttpServer())
      .post(`/api/users/${carla.id}/follow`)
      .set(ana.auth)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/users/${ana.id}/follow`)
      .set(bruno.auth)
      .expect(200);

    const following = (await followingOf(ana)).body as FollowListResponse;
    expect(following.total).toBe(2);
    expect(following.counts).toEqual({ followers: 1, following: 2 });
    expect(following.page).toBe(1);
    expect(following.pageSize).toBe(20);
    // Bruno follows ana back, carla does not; youFollow is what defines
    // membership in this list.
    expect(following.items).toHaveLength(2);
    expect(following.items).toEqual(
      expect.arrayContaining([
        {
          id: bruno.id,
          firstName: 'follow-bruno',
          lastName: 'Tester',
          followsYou: true,
          youFollow: true,
        },
        {
          id: carla.id,
          firstName: 'follow-carla',
          lastName: 'Tester',
          followsYou: false,
          youFollow: true,
        },
      ]),
    );

    const followers = (await followersOf(ana)).body as FollowListResponse;
    expect(followers.total).toBe(1);
    expect(followers.counts).toEqual({ followers: 1, following: 2 });
    expect(followers.items).toEqual([
      {
        id: bruno.id,
        firstName: 'follow-bruno',
        lastName: 'Tester',
        followsYou: true,
        youFollow: true,
      },
    ]);

    // The other side of the same edges, from bruno's seat.
    const brunoFollowers = (await followersOf(bruno))
      .body as FollowListResponse;
    expect(brunoFollowers.items).toEqual([
      {
        id: ana.id,
        firstName: 'follow-ana',
        lastName: 'Tester',
        followsYou: true,
        youFollow: true,
      },
    ]);
  });

  it('pages the lists without overlap or gaps (AC3)', async () => {
    const pageOne = (await followingOf(ana, '?page=1&pageSize=1'))
      .body as FollowListResponse;
    const pageTwo = (await followingOf(ana, '?page=2&pageSize=1'))
      .body as FollowListResponse;
    const pageThree = (await followingOf(ana, '?page=3&pageSize=1'))
      .body as FollowListResponse;

    expect(pageOne.items).toHaveLength(1);
    expect(pageTwo.items).toHaveLength(1);
    expect(pageThree.items).toHaveLength(0);
    expect(pageOne.total).toBe(2);
    expect(pageOne.pageSize).toBe(1);
    // Two pages of one cover exactly the two followed users, no repeats.
    const seen = [pageOne.items[0].id, pageTwo.items[0].id].sort();
    expect(seen).toEqual([bruno.id, carla.id].sort());
  });

  it('rejects out-of-range pagination params with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/me/following?page=0')
      .set(ana.auth)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/me/following?pageSize=0')
      .set(ana.auth)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/me/following?pageSize=101')
      .set(ana.auth)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/me/following?page=abc')
      .set(ana.auth)
      .expect(400);
    // An astronomical page passes @IsInt (1e20 is an "integer" to JS) but
    // not @Max: bounded input stays a 400 instead of overflowing Prisma's
    // skip into a 500.
    await request(app.getHttpServer())
      .get('/api/me/following?page=99999999999999999999')
      .set(ana.auth)
      .expect(400);
    // Unknown query params are rejected by the app-wide whitelist pipe,
    // the same contract as unknown body fields (the DTOs are the contract).
    await request(app.getHttpServer())
      .get('/api/me/following?utm_source=email')
      .set(ana.auth)
      .expect(400);
  });

  it('treats empty-but-present pagination params as unset, not zero', async () => {
    // ?page= parses as '' and Number('') is 0; the DTO maps empty to
    // undefined so the defaults apply instead of a @Min(1) rejection.
    const response = (await followingOf(ana, '?page=&pageSize='))
      .body as FollowListResponse;
    expect(response.page).toBe(1);
    expect(response.pageSize).toBe(20);
    expect(response.total).toBe(2);
  });

  it('removes the row on unfollow and repeating it is harmless (AC2)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/users/${bruno.id}/follow`)
      .set(ana.auth)
      .expect(204);

    const following = (await followingOf(ana)).body as FollowListResponse;
    expect(following.total).toBe(1);
    expect(following.items.map((item) => item.id)).toEqual([carla.id]);

    // Unfollowing again finds nothing to delete and stays 204.
    await request(app.getHttpServer())
      .delete(`/api/users/${bruno.id}/follow`)
      .set(ana.auth)
      .expect(204);

    // Bruno's own follow of ana is untouched: only the caller's edge went.
    const brunoFollowing = (await followingOf(bruno))
      .body as FollowListResponse;
    expect(brunoFollowing.items.map((item) => item.id)).toEqual([ana.id]);
  });

  it('cascades follow rows away when a user is deleted (AC4)', async () => {
    // carla is followed by ana at this point. Deleting carla must take the
    // edge with her, whichever end of it she was on.
    await prisma.user.delete({ where: { id: carla.id } });

    const orphans = await prisma.follow.count({
      where: { OR: [{ followerId: carla.id }, { followeeId: carla.id }] },
    });
    expect(orphans).toBe(0);

    const following = (await followingOf(ana)).body as FollowListResponse;
    expect(following.total).toBe(0);
  });

  it('answers 401, not 500, when a deleted users token tries to follow', async () => {
    const ghost = await signupTestUser(app, 'follow-ghost');
    await prisma.user.delete({ where: { id: ghost.id } });

    // The token still verifies, but the follower foreign key has no row.
    await request(app.getHttpServer())
      .post(`/api/users/${ana.id}/follow`)
      .set(ghost.auth)
      .expect(401);

    // Reads from the ghost session leak nothing: empty lists, zero counts.
    const followers = (await followersOf(ghost)).body as FollowListResponse;
    expect(followers.items).toEqual([]);
    expect(followers.counts).toEqual({ followers: 0, following: 0 });
  });
});
