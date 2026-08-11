import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './create-test-app';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    ({ app } = await createE2eApp());
  });

  // Public by the RUN-57 contract: reachable with no Authorization header
  // while everything else 401s (proven in user-isolation.e2e-spec).
  it('/api/hello (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/hello')
      .expect(200)
      .expect({ message: 'Welcome friend, hello from the NestJS API 👋' });
  });

  afterEach(async () => {
    await app.close();
  });
});
