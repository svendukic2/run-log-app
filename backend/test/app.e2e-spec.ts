import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror the global 'api' prefix configured in main.ts so e2e routes
    // match production (GET /api/hello).
    app.setGlobalPrefix('api');
    await app.init();
  });

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
