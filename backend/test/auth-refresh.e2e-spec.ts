import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service';
import type { AuthResponse } from './../src/auth/auth.service';
import {
  REFRESH_IDLE_WINDOW_SECONDS,
  SESSION_ABSOLUTE_MAX_SECONDS,
} from './../src/auth/token-lifecycle';
import { createE2eApp } from './create-test-app';

// Refresh and logout against the real database (RUN-74). The rules being
// proved here are the ones in src/auth/token-lifecycle.ts, and the reason
// they get a real database rather than a unit test is that revocation IS a
// database read: a mocked Prisma would prove only that the mock agrees with
// itself.
//
// The suite signs its own tokens through the app's JwtService, which is the
// only honest way to reach the far edges: a token that is genuinely two
// weeks old, or a pre-RUN-74 token that carries none of the new claims.
// Clock mocking would not do it, because the claims are baked in at signing.
describe('Auth refresh and logout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;

  const credentials = {
    email: 'refresher@example.com',
    password: 'correct horse battery staple',
    firstName: 'Ref',
    lastName: 'Resher',
  };

  function nowInSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  // Mints a token with claims we choose, standing in for one issued at some
  // point in the past. `exp` is always in the past: refresh is supposed to
  // accept expired tokens, so testing it with fresh ones would test nothing.
  async function signToken(claims: Record<string, unknown>): Promise<string> {
    // expiresIn is cleared because the module sets one and jsonwebtoken
    // refuses to be told the expiry twice. The `iat` in the payload survives
    // as given (noTimestamp would delete it, which is not what we want).
    return jwt.signAsync(claims, { expiresIn: undefined });
  }

  async function signUp(): Promise<AuthResponse> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(credentials)
      .expect(201);
    return response.body as AuthResponse;
  }

  function refresh(token: string) {
    return request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
    jwt = app.get(JwtService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  it('renews an expired token, and the renewal opens guarded endpoints', async () => {
    const { user } = await signUp();
    const issuedAt = nowInSeconds() - 60 * 60;
    // Expired an hour ago but well inside the idle window: the everyday
    // case, a user coming back to a tab they left open.
    const stale = await signToken({
      sub: user.id,
      email: user.email,
      ver: 0,
      sst: issuedAt,
      iat: issuedAt,
      exp: issuedAt + 15 * 60,
    });

    await request(app.getHttpServer())
      .get('/api/runs')
      .set('Authorization', `Bearer ${stale}`)
      .expect(401);

    const renewed = (await refresh(stale).expect(200)).body as AuthResponse;

    expect(renewed.token).not.toBe(stale);
    expect(renewed.user.id).toBe(user.id);
    await request(app.getHttpServer())
      .get('/api/runs')
      .set('Authorization', `Bearer ${renewed.token}`)
      .expect(200);
  });

  it('renews a pre-RUN-74 token that carries no version or session claim', async () => {
    // THE deploy-safety test. Tokens in real browsers right now were signed
    // as { sub, email } with a seven day expiry. The missing `ver` must read
    // as 0 and match the column default, or shipping this logs everyone out.
    const { user } = await signUp();
    const issuedAt = nowInSeconds() - 8 * 24 * 60 * 60;
    const legacy = await signToken({
      sub: user.id,
      email: user.email,
      iat: issuedAt,
      exp: issuedAt + 7 * 24 * 60 * 60,
    });

    const renewed = (await refresh(legacy).expect(200)).body as AuthResponse;

    expect(renewed.user.id).toBe(user.id);
  });

  it('refuses a token older than the idle window, and one past the session ceiling', async () => {
    const { user } = await signUp();
    const now = nowInSeconds();

    // Abandoned: issued longer ago than the idle window allows.
    const idle = await signToken({
      sub: user.id,
      email: user.email,
      ver: 0,
      sst: now - REFRESH_IDLE_WINDOW_SECONDS - 60,
      iat: now - REFRESH_IDLE_WINDOW_SECONDS - 60,
      exp: now - 60,
    });
    await refresh(idle).expect(401);

    // Actively used the whole time - a fresh `iat` slides the idle window -
    // but the session itself began before the absolute ceiling. This is the
    // case that proves sliding cannot go on forever.
    const ancient = await signToken({
      sub: user.id,
      email: user.email,
      ver: 0,
      sst: now - SESSION_ABSOLUTE_MAX_SECONDS - 60,
      iat: now - 60,
      exp: now + 15 * 60,
    });
    await refresh(ancient).expect(401);
  });

  it('logout ends the session: the same token no longer refreshes', async () => {
    const { token } = await signUp();

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    expect((await prisma.user.findFirst())?.tokenVersion).toBe(1);
    await refresh(token).expect(401);

    // And signing in again works, on the bumped version.
    const again = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    await refresh((again.body as AuthResponse).token).expect(200);
  });

  it('logout answers 204 with no token at all, and refresh answers 401', async () => {
    // Signing out must never fail in the user's face; refresh has no such
    // obligation and says the session is over.
    await request(app.getHttpServer()).post('/api/auth/logout').expect(204);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer not.a.token')
      .expect(204);
    await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
  });
});
