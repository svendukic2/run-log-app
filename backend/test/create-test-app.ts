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

// Registers `${name}@example.com` and returns the header that authenticates
// as them, which is all a spec ever needs from a signup.
export async function signupUser(
  app: INestApplication<App>,
  name: string,
): Promise<{ Authorization: string }> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/signup')
    .send({
      email: `${name}@example.com`,
      password: E2E_PASSWORD,
      firstName: name,
      lastName: 'Tester',
    })
    .expect(201);
  return { Authorization: `Bearer ${(response.body as AuthResponse).token}` };
}
