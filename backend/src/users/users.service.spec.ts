import { NotFoundException } from '@nestjs/common';
import { toDbDate } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

// Mocks rather than the e2e suite, for the same reason PrivacyService uses
// them: what has to be provable here is not that a query runs, it is that a
// private profile's body is never READ, let alone serialized. A mock can
// assert "the runs table was not touched"; a round trip can only assert
// what came back.

const OWNER = 'user-owner';
const VISITOR = 'user-visitor';

const RUN_ROW = {
  id: 'run-1',
  routeName: 'Riverside loop',
  distanceKm: 8.2,
  durationSeconds: 2535,
  date: toDbDate('2026-08-01'),
  effort: 'Medium',
  note: 'Felt good',
  userId: OWNER,
};

function makeService(
  settings: { profilePublic: boolean; showRoutes: boolean } | null,
) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          settings === null
            ? null
            : { id: OWNER, firstName: 'Ana', lastName: 'Tester', ...settings },
        ),
    },
    follow: {
      count: jest.fn().mockResolvedValue(3),
      findUnique: jest.fn().mockResolvedValue({ id: 'edge-1' }),
    },
    run: { findMany: jest.fn().mockResolvedValue([RUN_ROW]) },
  };
  return {
    prisma,
    service: new UsersService(prisma as unknown as PrismaService),
  };
}

describe('UsersService.findPublicProfile', () => {
  // The gate, in one table. Each row is one AC: a public profile serves its
  // body (AC1), a private one omits it (AC2), and the owner sees their own
  // regardless of the toggles (AC3).
  it.each([
    ['a public profile to a visitor', true, VISITOR, true, false],
    ['a private profile to a visitor', false, VISITOR, false, false],
    ['a private profile to its owner', false, OWNER, true, true],
  ])('serves %s', async (_case, profilePublic, viewer, visible, routes) => {
    const { prisma, service } = makeService({
      profilePublic,
      showRoutes: false,
    });

    const profile = await service.findPublicProfile(viewer, OWNER);

    expect(profile.visible).toBe(visible);
    expect(profile.showRoutes).toBe(routes);
    // The load-bearing assertion: gated means ABSENT, not hidden. Nothing a
    // client could open devtools on, and no query that produced it either.
    expect(profile.runs).toEqual(
      visible ? [expect.objectContaining({ id: 'run-1' })] : null,
    );
    expect(prisma.run.findMany).toHaveBeenCalledTimes(visible ? 1 : 0);
    // The header renders on every one of these (AC2 needs it on the private
    // one too), so the identity and the counts are never gated.
    expect(profile).toMatchObject({
      id: OWNER,
      firstName: 'Ana',
      lastName: 'Tester',
      counts: { followers: 3, following: 3 },
    });
  });

  // showRoutes is strictly narrower than profilePublic: a public profile
  // that has not opted into routes serves its runs without them.
  it('serves a public profile without routes when showRoutes is off', async () => {
    const { service } = makeService({ profilePublic: true, showRoutes: false });

    const profile = await service.findPublicProfile(VISITOR, OWNER);

    expect(profile.visible).toBe(true);
    expect(profile.showRoutes).toBe(false);
  });

  // AC5: only an id that matches nothing is 404. A private account is a 200
  // above, because it still has a header it may serve - never 403, which
  // would be the wrong status for "header yes, body no".
  it('404s an unknown id', async () => {
    const { service } = makeService(null);

    await expect(
      service.findPublicProfile(VISITOR, 'user-ghost'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // Following yourself is impossible (the follow endpoint rejects it), so
  // the self case must not claim it and must not spend a query asking.
  it('never reports the owner as following themselves', async () => {
    const { prisma, service } = makeService({
      profilePublic: true,
      showRoutes: true,
    });

    const profile = await service.findPublicProfile(OWNER, OWNER);

    expect(profile).toMatchObject({ me: true, following: false });
    expect(prisma.follow.findUnique).not.toHaveBeenCalled();
  });
});
