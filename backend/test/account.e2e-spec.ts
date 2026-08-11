import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AccountResponse } from './../src/account/account.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { createE2eApp, signupUser } from './create-test-app';

function accountBody(response: request.Response): AccountResponse {
  return response.body as AccountResponse;
}

// Full-path GET/PUT /api/account against the real database (RUN-59). The
// User row is the app's single source of truth for a runner's name and
// email, so this suite proves the identity a signup created is readable and
// editable here, and that the unique email index shows up as a 409 rather
// than a 500.
describe('Account API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  it('401s both endpoints without a token', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/account').expect(401);
    await request(server)
      .put('/api/account')
      .send({ firstName: 'Ana', lastName: 'Anić', email: 'ana@example.com' })
      .expect(401);
  });

  it('returns the identity the signup stored', async () => {
    const auth = await signupUser(app, 'account-owner');

    const response = await request(app.getHttpServer())
      .get('/api/account')
      .set(auth)
      .expect(200);

    // No id and no password material: only the human-facing fields.
    expect(accountBody(response)).toEqual({
      firstName: 'account-owner',
      lastName: 'Tester',
      email: 'account-owner@example.com',
    });
  });

  it('changes the identity on PUT and the change is visible on the next GET', async () => {
    const server = app.getHttpServer();
    const auth = await signupUser(app, 'account-editor');

    const updated = {
      firstName: 'Vesna',
      lastName: 'Vukić',
      email: 'vesna@example.com',
    };
    const written = await request(server)
      .put('/api/account')
      .set(auth)
      .send(updated)
      .expect(200);
    expect(accountBody(written)).toEqual(updated);

    const read = await request(server)
      .get('/api/account')
      .set(auth)
      .expect(200);
    expect(accountBody(read)).toEqual(updated);
  });

  it('409s an email another account already owns', async () => {
    const auth = await signupUser(app, 'account-first');
    await signupUser(app, 'account-second');

    await request(app.getHttpServer())
      .put('/api/account')
      .set(auth)
      .send({
        firstName: 'Ana',
        lastName: 'Anić',
        email: 'account-second@example.com',
      })
      .expect(409);
  });
});
