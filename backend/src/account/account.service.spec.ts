import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';
import type { PutAccountDto } from './dto/put-account.dto';

// Service-level tests with a mocked PrismaService, the same approach as the
// auth and profile service specs. What only mocks can prove here is the
// error mapping: a Prisma failure code must become the right HTTP status,
// never a 500, and the two "row is gone" paths must answer as dead sessions
// rather than 404s. Prisma errors are fabricated as bare `{ code }` objects
// because isPrismaError is deliberately duck-typed (see prisma-errors.ts).

const IDENTITY = {
  firstName: 'Ana',
  lastName: 'Anić',
  email: 'ana@example.com',
};

function makeMocks() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new AccountService(prisma as unknown as PrismaService);
  return { prisma, service };
}

function dto(overrides: Partial<PutAccountDto> = {}): PutAccountDto {
  return { ...IDENTITY, ...overrides };
}

describe('AccountService', () => {
  describe('get', () => {
    it('returns the account identity and nothing else', async () => {
      const { prisma, service } = makeMocks();
      prisma.user.findUnique.mockResolvedValue(IDENTITY);

      await expect(service.get('user-1')).resolves.toEqual(IDENTITY);
      // Scoped to the token's own row: no way to read another account.
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
    });

    it('401s rather than 404s when the user row is gone (deleted mid-session)', async () => {
      const { prisma, service } = makeMocks();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.get('user-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('put', () => {
    it('returns the updated identity', async () => {
      const { prisma, service } = makeMocks();
      const updated = { ...IDENTITY, firstName: 'Vesna' };
      prisma.user.update.mockResolvedValue(updated);

      await expect(
        service.put('user-1', dto({ firstName: 'Vesna' })),
      ).resolves.toEqual(updated);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { ...IDENTITY, firstName: 'Vesna' },
        }),
      );
    });

    it('maps a unique violation on the email to 409 Conflict', async () => {
      const { prisma, service } = makeMocks();
      prisma.user.update.mockRejectedValue({ code: 'P2002' });

      await expect(service.put('user-1', dto())).rejects.toThrow(
        ConflictException,
      );
    });

    it('maps a vanished row (P2025) to 401, same reasoning as get', async () => {
      const { prisma, service } = makeMocks();
      prisma.user.update.mockRejectedValue({ code: 'P2025' });

      await expect(service.put('user-1', dto())).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
