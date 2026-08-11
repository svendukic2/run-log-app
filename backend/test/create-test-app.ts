import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import type { AuthResponse } from '../src/auth/auth.service';

// The one place the e2e suite boots the app, so the bootstrap cannot drift
// between spec files (it existed four times before this helper; CLAUDE.md
// flags the global prefix as exactly that kind of trap). Mirrors what
// main.ts does to the production app - if main.ts gains a bootstrap step
// the e2e suite must see, add it HERE, once.
export async function createE2eApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  // Mirror the global 'api' prefix configured in main.ts so e2e routes
  // match production.
  app.setGlobalPrefix('api');
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

// One password for every e2e account: the suites test authorization
// boundaries, not password strength.
export const E2E_PASSWORD = 'correct horse battery staple';

// A signed-up account as a spec sees it: the id for building /users/:id
// URLs and asserting list contents, the header for authenticating as them.
export interface TestUser {
  id: string;
  auth: { Authorization: string };
}

// Registers `${name}@example.com` and returns the id + auth header pair.
export async function signupTestUser(
  app: INestApplication<App>,
  name: string,
): Promise<TestUser> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/signup')
    .send({
      email: `${name}@example.com`,
      password: E2E_PASSWORD,
      firstName: name,
      lastName: 'Tester',
    })
    .expect(201);
  const body = response.body as AuthResponse;
  return { id: body.user.id, auth: { Authorization: `Bearer ${body.token}` } };
}

// The header-only shorthand, which is all most specs need from a signup.
export async function signupUser(
  app: INestApplication<App>,
  name: string,
): Promise<{ Authorization: string }> {
  return (await signupTestUser(app, name)).auth;
}
