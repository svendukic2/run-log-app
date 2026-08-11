import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import type { AuthResponse } from './../src/auth/auth.service';

function authBody(response: request.Response): AuthResponse {
  return response.body as AuthResponse;
}

function errorMessages(response: request.Response): string[] {
  const { message } = response.body as { message: string | string[] };
  return Array.isArray(message) ? message : [message];
}

function tokenPayload(token: string): { sub: string; email: string } {
  return JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString(),
  ) as { sub: string; email: string };
}

// Full-path signup/login against the real database (CI provides Postgres as
// a service container). Each test starts from an empty User table.
describe('Auth API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  function validSignup() {
    return {
      email: 'ana@example.com',
      password: 'correct horse battery staple',
      firstName: 'Ana',
      lastName: 'Anić',
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror the global 'api' prefix configured in main.ts so e2e routes
    // match production.
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  it('signs up a user, returns a token whose subject is the user id (AC1)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(validSignup())
      .expect(201);

    const { token, user } = authBody(response);
    expect(user).toEqual({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any is typed any
      id: expect.any(String),
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Anić',
    });
    expect(tokenPayload(token).sub).toBe(user.id);
  });

  it('stores a bcrypt hash in the database, never the password (AC1, AC4)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(validSignup())
      .expect(201);

    const row = await prisma.user.findUnique({
      where: { email: 'ana@example.com' },
    });
    expect(row).not.toBeNull();
    expect(row!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row!.passwordHash).not.toContain(validSignup().password);
  });

  it('never returns password material from signup or login (AC4)', async () => {
    const signup = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(validSignup())
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: validSignup().password })
      .expect(200);

    for (const body of [signup.body, login.body]) {
      expect(JSON.stringify(body).toLowerCase()).not.toContain('password');
    }
  });

  it('normalizes the email so case and whitespace variants are one account', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...validSignup(), email: '  Ana@Example.COM ' })
      .expect(201);
    expect(authBody(response).user.email).toBe('ana@example.com');

    // The variant spelling is the same account: signup collides (AC2)...
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...validSignup(), email: 'ANA@EXAMPLE.COM' })
      .expect(409);
    // ...and login with it reaches the account.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'Ana@example.com', password: validSignup().password })
      .expect(200);
  });

  it('accepts a decomposed (NFD) password at signup and the composed (NFC) form at login', async () => {
    // 'a' + U+0308 combining diaeresis vs precomposed U+00E4: different
    // bytes, same characters on screen. macOS text stacks routinely send
    // the former; without NFC canonicalization this login would 401.
    const nfdPassword = 'pa\u0308ssword-dovoljno-duga';
    const nfcPassword = 'p\u00e4ssword-dovoljno-duga';

    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...validSignup(), password: nfdPassword })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: nfcPassword })
      .expect(200);
  });

  it('rejects a password over 72 UTF-8 bytes even when it is 72 characters (bcrypt cap)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...validSignup(), password: '\u0107'.repeat(72) }) // 144 bytes
      .expect(400);

    expect(errorMessages(response).join(' ')).toContain('72 bytes');
  });

  it('409s on a duplicate email with a clear message and creates no user (AC2)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(validSignup())
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...validSignup(), firstName: 'Impostor' })
      .expect(409);

    expect(errorMessages(response).join(' ')).toContain('already exists');
    expect(await prisma.user.count()).toBe(1);
    const row = await prisma.user.findUnique({
      where: { email: 'ana@example.com' },
    });
    expect(row!.firstName).toBe('Ana');
  });

  it('logs in with valid credentials and issues a token for the right user (AC3)', async () => {
    const signup = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(validSignup())
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: validSignup().password })
      .expect(200);

    expect(tokenPayload(authBody(response).token).sub).toBe(
      authBody(signup).user.id,
    );
  });

  it('401s with one identical generic message for wrong password and unknown email (AC3)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(validSignup())
      .expect(201);

    const wrongPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'not the password' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever password' })
      .expect(401);

    // Byte-identical bodies: any difference would leak whether the email is
    // registered.
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(errorMessages(wrongPassword).join(' ')).toContain(
      'Invalid email or password',
    );
  });

  it('rejects invalid signup payloads with 400 and field-level messages (AC5)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: 'not-an-email',
        password: 'short',
        firstName: '   ',
        // lastName missing entirely
      })
      .expect(400);

    expect(errorMessages(response)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('email'),
        expect.stringContaining('password must be at least 8'),
        expect.stringContaining('firstName'),
        expect.stringContaining('lastName'),
      ]),
    );
  });

  it('rejects unknown properties instead of silently storing them', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...validSignup(), isAdmin: true })
      .expect(400);

    expect(errorMessages(response).join(' ')).toContain('isAdmin');
  });

  it('login validates shape but says nothing about credentials in 400s', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);

    expect(errorMessages(response)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('email'),
        expect.stringContaining('password'),
      ]),
    );
  });
});
