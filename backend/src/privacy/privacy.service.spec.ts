import { UnauthorizedException } from '@nestjs/common';
import {
  appearsOnLeaderboard,
  canViewProfile,
  canViewRoutes,
  PRIVACY_DEFAULTS,
  type PrivacySettings,
} from '../common/privacy';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

// Mocks rather than the e2e suite for two reasons: the defaults are a
// schema promise the service must not "helpfully" override, and the write
// must be provably narrow - it updates the User row, which also holds the
// password hash.

function makeService(stored: PrivacySettings | null) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(stored),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: PrivacySettings }) =>
          Promise.resolve(data),
        ),
    },
  };
  return {
    prisma,
    service: new PrivacyService(prisma as unknown as PrismaService),
  };
}

describe('PrivacyService', () => {
  // AC3: a fresh account is private on all three counts. The row carries
  // the schema defaults; the service must hand them back untouched.
  it('serves a fresh account all three settings off', async () => {
    const { service } = makeService({ ...PRIVACY_DEFAULTS });

    await expect(service.get('user-1')).resolves.toEqual({
      profilePublic: false,
      showOnLeaderboard: false,
      showRoutes: false,
    });
  });

  // AC2: the PUT persists exactly the three toggles, scoped to the caller.
  it('persists the toggles for the calling account only', async () => {
    const { prisma, service } = makeService({ ...PRIVACY_DEFAULTS });

    const saved = await service.put('user-1', {
      profilePublic: true,
      showOnLeaderboard: true,
      showRoutes: false,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        profilePublic: true,
        showOnLeaderboard: true,
        showRoutes: false,
      },
      select: {
        profilePublic: true,
        showOnLeaderboard: true,
        showRoutes: true,
      },
    });
    expect(saved).toEqual({
      profilePublic: true,
      showOnLeaderboard: true,
      showRoutes: false,
    });
  });

  // The token verified but the account is gone: a dead session, not an
  // empty resource (there is no 404 case on this endpoint).
  it('answers a deleted account with 401, not an empty result', async () => {
    const { service } = makeService(null);

    await expect(service.get('ghost')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('appearsOnLeaderboard', () => {
  // The gate every leaderboard shares (AC4): opted out means unranked,
  // and the default is opted out.
  it('ranks only opted-in accounts, and defaults to opted out', () => {
    expect(appearsOnLeaderboard(PRIVACY_DEFAULTS)).toBe(false);
    expect(appearsOnLeaderboard({ showOnLeaderboard: true })).toBe(true);
  });
});

// The public profile's two gates (RUN-63), pure and table-driven: the
// owner override is a VIEWER check, so every row states both ids.
describe('canViewProfile / canViewRoutes', () => {
  const owner = 'user-owner';
  const visitor = 'user-visitor';

  it.each([
    // settings, viewer, sees body, sees routes
    [{ profilePublic: false, showRoutes: false }, visitor, false, false],
    [{ profilePublic: false, showRoutes: true }, visitor, false, false],
    [{ profilePublic: true, showRoutes: false }, visitor, true, false],
    [{ profilePublic: true, showRoutes: true }, visitor, true, true],
    // AC3: the owner always sees everything, whatever the toggles say.
    [{ profilePublic: false, showRoutes: false }, owner, true, true],
  ])('%o seen by %s', (settings, viewer, body, routes) => {
    expect(canViewProfile(settings, viewer, owner)).toBe(body);
    expect(canViewRoutes(settings, viewer, owner)).toBe(routes);
  });

  it('defaults to private on both counts', () => {
    expect(canViewProfile(PRIVACY_DEFAULTS, visitor, owner)).toBe(false);
    expect(canViewRoutes(PRIVACY_DEFAULTS, visitor, owner)).toBe(false);
  });
});
