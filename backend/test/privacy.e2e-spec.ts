import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { PrivacyResponse } from './../src/privacy/privacy.service';
import { createE2eApp, signupUser } from './create-test-app';

// The privacy settings against the real database (RUN-64). Two things only
// this level can prove: the migration's column defaults are what a fresh
// signup actually gets (AC3), and a saved toggle survives the round trip
// (AC2). Everything else about the endpoint is covered by the service spec.
describe('Privacy settings API (e2e)', () => {
  let app: INestApplication<App>;
  let auth: { Authorization: string };

  beforeAll(async () => {
    ({ app } = await createE2eApp());
    auth = await signupUser(app, 'privacy-ana');
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts every account private on all three settings (AC3)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/privacy')
      .set(auth)
      .expect(200);

    expect(response.body as PrivacyResponse).toEqual({
      profilePublic: false,
      showOnLeaderboard: false,
      showRoutes: false,
    });
  });

  it('persists a saved toggle and rejects a non-boolean (AC2)', async () => {
    await request(app.getHttpServer())
      .put('/api/privacy')
      .set(auth)
      .send({
        profilePublic: true,
        showOnLeaderboard: false,
        showRoutes: true,
      })
      .expect(200);

    const reread = await request(app.getHttpServer())
      .get('/api/privacy')
      .set(auth)
      .expect(200);
    expect(reread.body as PrivacyResponse).toEqual({
      profilePublic: true,
      showOnLeaderboard: false,
      showRoutes: true,
    });

    // "false" as a string must not switch a setting on: the toggle that
    // grants visibility is the one place truthiness must not decide.
    await request(app.getHttpServer())
      .put('/api/privacy')
      .set(auth)
      .send({
        profilePublic: 'false',
        showOnLeaderboard: false,
        showRoutes: true,
      })
      .expect(400);
  });
});
