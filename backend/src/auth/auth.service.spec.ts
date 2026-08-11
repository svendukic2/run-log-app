import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthService,
  BCRYPT_ROUNDS,
  INVALID_CREDENTIALS_MESSAGE,
} from './auth.service';

// Service-level tests with a mocked PrismaService and a real JwtService
// (a mocked signer would make the sub-claim assertions circular). bcrypt is
// real too: AC1/AC4 are about what actually gets hashed and stored.
describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const signupDto = () => ({
    email: 'ana@example.com',
    password: 'correct horse battery staple',
    firstName: 'Ana',
    lastName: 'Anić',
  });

  // What prisma.user.create would return for signupDto, given `data`.
  function rowFromCreate(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }) {
    return { id: 'user-1', createdAt: new Date(), ...data };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: JwtService,
          useValue: new JwtService({
            secret: 'unit-test-secret-32-characters-x',
          }),
        },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('signup', () => {
    it('stores a bcrypt hash with cost >= 10, never the password (AC1, AC4)', async () => {
      // Captured through the typed implementation rather than read back from
      // jest's untyped .mock.calls.
      let stored: Parameters<typeof rowFromCreate>[0] | undefined;
      prismaMock.user.create.mockImplementation(
        ({ data }: { data: Parameters<typeof rowFromCreate>[0] }) => {
          stored = data;
          return Promise.resolve(rowFromCreate(data));
        },
      );

      await service.signup(signupDto());

      expect(stored).toBeDefined();
      const data = stored!;
      expect(data.passwordHash).not.toContain(signupDto().password);
      expect(bcrypt.getRounds(data.passwordHash)).toBeGreaterThanOrEqual(10);
      expect(bcrypt.getRounds(data.passwordHash)).toBe(BCRYPT_ROUNDS);
      await expect(
        bcrypt.compare(signupDto().password, data.passwordHash),
      ).resolves.toBe(true);
    });

    it('returns a JWT with the user id as subject and no password material (AC1, AC4)', async () => {
      prismaMock.user.create.mockImplementation(
        ({ data }: { data: Parameters<typeof rowFromCreate>[0] }) =>
          Promise.resolve(rowFromCreate(data)),
      );

      const response = await service.signup(signupDto());

      const payload = JSON.parse(
        Buffer.from(response.token.split('.')[1], 'base64url').toString(),
      ) as { sub: string; email: string };
      expect(payload.sub).toBe('user-1');
      expect(payload.email).toBe('ana@example.com');
      expect(response.user).toEqual({
        id: 'user-1',
        email: 'ana@example.com',
        firstName: 'Ana',
        lastName: 'Anić',
      });
      // AC4 stated as a property of the whole response, not of named fields:
      // no key and no value anywhere in it may carry the password or hash.
      expect(JSON.stringify(response).toLowerCase()).not.toContain('password');
    });

    it('maps a unique violation to 409 Conflict (AC2)', async () => {
      prismaMock.user.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.signup(signupDto())).rejects.toThrow(
        ConflictException,
      );
    });

    it('rethrows database errors that are not unique violations', async () => {
      prismaMock.user.create.mockRejectedValue(new Error('connection reset'));

      await expect(service.signup(signupDto())).rejects.toThrow(
        'connection reset',
      );
    });
  });

  describe('login', () => {
    async function storedUser() {
      return rowFromCreate({
        email: 'ana@example.com',
        passwordHash: await bcrypt.hash(signupDto().password, BCRYPT_ROUNDS),
        firstName: 'Ana',
        lastName: 'Anić',
      });
    }

    it('returns a JWT with the user id as subject for valid credentials (AC3)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(await storedUser());

      const response = await service.login({
        email: 'ana@example.com',
        password: signupDto().password,
      });

      const payload = JSON.parse(
        Buffer.from(response.token.split('.')[1], 'base64url').toString(),
      ) as { sub: string };
      expect(payload.sub).toBe('user-1');
    });

    it('rejects a wrong password and an unknown email with the identical generic 401 (AC3)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(await storedUser());
      const wrongPassword = service.login({
        email: 'ana@example.com',
        password: 'not the password',
      });
      await expect(wrongPassword).rejects.toThrow(UnauthorizedException);
      await expect(wrongPassword).rejects.toThrow(INVALID_CREDENTIALS_MESSAGE);

      prismaMock.user.findUnique.mockResolvedValue(null);
      const unknownEmail = service.login({
        email: 'nobody@example.com',
        password: signupDto().password,
      });
      // The same exception with the same message: a different one would name
      // which half of the credentials was wrong.
      await expect(unknownEmail).rejects.toThrow(UnauthorizedException);
      await expect(unknownEmail).rejects.toThrow(INVALID_CREDENTIALS_MESSAGE);
    });
  });
});
