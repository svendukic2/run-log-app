import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import type { ProfileResponse } from './../src/profile/profile.service';
import { createE2eApp, signupUser } from './create-test-app';

function profileBody(response: request.Response): ProfileResponse {
  return response.body as ProfileResponse;
}

function errorMessages(response: request.Response): string[] {
  const { message } = response.body as { message: string | string[] };
  return Array.isArray(message) ? message : [message];
}

// Full-path GET/PUT /api/profile against the real database (RUN-49). One
// resource per account: the routes carry no id, the owner is the token.
// Since RUN-59 the profile holds the setup answers only - the runner's name
// and email live on /api/account (see account.e2e-spec.ts).
describe('Profile API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: { Authorization: string };

  function validProfile() {
    return {
      runningLevel: 'Intermediate',
      defaultWeeklyGoalKm: 25,
    };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
    await prisma.user.deleteMany();
    auth = await signupUser(app, 'profile-owner');
  });

  beforeEach(async () => {
    await prisma.profile.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  it('401s both endpoints without a token', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/profile').expect(401);
    await request(server).put('/api/profile').send(validProfile()).expect(401);
  });

  it('404s the GET before the profile was ever PUT (the onboarding gate)', async () => {
    await request(app.getHttpServer())
      .get('/api/profile')
      .set(auth)
      .expect(404);
  });

  it('creates on first PUT and returns exactly the contract shape', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/profile')
      .set(auth)
      .send(validProfile())
      .expect(200);

    // No id, no userId: the owner is implicit in the token. And no name or
    // email: those are the account's, not the profile's (RUN-59).
    expect(response.body).toEqual(validProfile());

    const read = await request(app.getHttpServer())
      .get('/api/profile')
      .set(auth)
      .expect(200);
    expect(read.body).toEqual(validProfile());
  });

  it('replaces the whole profile on a second PUT', async () => {
    const server = app.getHttpServer();
    await request(server).put('/api/profile').set(auth).send(validProfile());

    const replaced = {
      runningLevel: 'Advanced',
      defaultWeeklyGoalKm: 40,
    };
    await request(server)
      .put('/api/profile')
      .set(auth)
      .send(replaced)
      .expect(200);

    const read = await request(server)
      .get('/api/profile')
      .set(auth)
      .expect(200);
    expect(profileBody(read)).toEqual(replaced);

    // Still one row, not an accumulating history.
    expect(await prisma.profile.count()).toBe(1);
  });

  it('400s validation failures without touching the stored row', async () => {
    const server = app.getHttpServer();
    await request(server).put('/api/profile').set(auth).send(validProfile());

    const cases = [
      { ...validProfile(), runningLevel: 'intermediate' },
      { ...validProfile(), defaultWeeklyGoalKm: 61 },
      { ...validProfile(), defaultWeeklyGoalKm: -1 },
    ];
    for (const payload of cases) {
      await request(server)
        .put('/api/profile')
        .set(auth)
        .send(payload)
        .expect(400);
    }

    const read = await request(server)
      .get('/api/profile')
      .set(auth)
      .expect(200);
    expect(profileBody(read)).toEqual(validProfile());
  });

  it('400s unknown properties by name (the DTO is the contract)', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/profile')
      .set(auth)
      .send({ ...validProfile(), isAdmin: true })
      .expect(400);
    expect(errorMessages(response).join(' ')).toContain('isAdmin');
  });

  it('rejects the identity fields that moved to /api/account (RUN-59)', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/profile')
      .set(auth)
      .send({ ...validProfile(), firstName: 'Ana', email: 'ana@example.com' })
      .expect(400);
    const messages = errorMessages(response).join(' ');
    expect(messages).toContain('firstName');
    expect(messages).toContain('email');
  });

  it('keeps profiles per account: another user neither sees nor overwrites mine', async () => {
    const server = app.getHttpServer();
    await request(server).put('/api/profile').set(auth).send(validProfile());

    const other = await signupUser(app, 'profile-other');
    await request(server).get('/api/profile').set(other).expect(404);

    const otherProfile = {
      runningLevel: 'Beginner',
      defaultWeeklyGoalKm: 10,
    };
    await request(server)
      .put('/api/profile')
      .set(other)
      .send(otherProfile)
      .expect(200);

    const mine = await request(server)
      .get('/api/profile')
      .set(auth)
      .expect(200);
    expect(profileBody(mine)).toEqual(validProfile());
  });
});
