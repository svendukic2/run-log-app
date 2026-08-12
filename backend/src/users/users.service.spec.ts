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

// A run WITH a route (RUN-54), because that is the interesting row here: the
// profile must serve it or drop it depending on the owner's showRoutes.
const RUN_ROUTE = {
  routePolyline: 'wap_IsyspAsFgc@cG{h@qFe{A',
  routeWaypoints: [
    { lat: 52.516275, lng: 13.377704 },
    { lat: 52.520008, lng: 13.404954 },
  ],
  routeSource: 'openrouteservice',
};

const RUN_ROW = {
  id: 'run-1',
  routeName: 'Riverside loop',
  distanceKm: 8.2,
  durationSeconds: 2535,
  date: toDbDate('2026-08-01'),
  effort: 'Medium',
  note: 'Felt good',
  ...RUN_ROUTE,
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

// The search (RUN-62). Mocked for the same reason as above and one more:
// what matters is the WHERE this builds - the caller's exclusion and the
// case-insensitive match across both names - which a round trip can only
// observe indirectly through whichever rows a seeded database happens to
// hold.
type SearchRow = { id: string; firstName: string; lastName: string };

// The one argument the assertions read back, typed so reaching into the
// recorded call is not an `any` walk.
interface FindManyArgs {
  where: { id: { not: string }; AND: unknown[] };
}

function makeSearchService(rows: SearchRow[]) {
  const prisma = {
    user: {
      findMany: jest
        .fn<Promise<SearchRow[]>, [FindManyArgs]>()
        .mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
    follow: {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn().mockResolvedValue([{ followeeId: 'user-ana' }]),
    },
  };
  return {
    prisma,
    service: new UsersService(prisma as unknown as PrismaService),
  };
}

const ANA = { id: 'user-ana', firstName: 'Ana', lastName: 'Tester' };

describe('UsersService.searchUsers (RUN-62)', () => {
  // AC1 in one table: one term or two, either order, any casing, all of it
  // reaching the same runner. The assertion is on the WHERE rather than on
  // the mocked rows, because the mock would return Ana for any query at all.
  it.each([['ana'], ['ANA'], ['ana tes'], ['tes ana']])(
    'matches %s case-insensitively across both names, never the caller',
    async (search) => {
      const { prisma, service } = makeSearchService([ANA]);

      const result = await service.searchUsers(VISITOR, { search });

      const { where } = prisma.user.findMany.mock.calls[0][0];
      expect(where.id).toEqual({ not: VISITOR });
      expect(where.AND).toEqual(
        search.split(' ').map((term) => ({
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
          ],
        })),
      );
      // The row carries the caller's follow state, so the button renders
      // right on the first paint, and nothing the account has not shared.
      expect(result.items).toEqual([{ ...ANA, following: true }]);
      expect(result.counts).toEqual({ followers: 2, following: 2 });
    },
  );

  it('serves an empty list when nothing matches', async () => {
    const { service } = makeSearchService([]);

    const result = await service.searchUsers(VISITOR, { search: 'zzz' });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    // The counts are the no-results state's whole content, so they are
    // served even when the list is empty.
    expect(result.counts).toEqual({ followers: 2, following: 2 });
  });

  // No query means the People page's opening state: the caller's counts and
  // nothing else. A LIKE '%%' over every account would be the one query that
  // gets slower forever, so it is never issued.
  //
  // A bare wildcard is the same request wearing a disguise (review fix):
  // Prisma does not escape LIKE's metacharacters inside `contains`, so '%'
  // would otherwise match everyone. It is stripped, which leaves no terms,
  // which lands in exactly this short-circuit.
  it.each([{}, { search: '%' }, { search: '_ \\' }])(
    'never scans the user table for %s',
    async (query) => {
      const { prisma, service } = makeSearchService([ANA]);

      const result = await service.searchUsers(VISITOR, query);

      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.user.count).not.toHaveBeenCalled();
      // The counts are still the answer: they are what the page shows
      // before anything worth searching for has been typed.
      expect(result).toMatchObject({
        items: [],
        total: 0,
        counts: { followers: 2, following: 2 },
      });
    },
  );
});

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
  // that has not opted into routes serves its runs without them. Since RUN-54
  // there is real route data to withhold, so the assertion is on the PAYLOAD,
  // not just the flag - a flag the client is trusted to honour is not a
  // privacy control.
  it('serves a public profile without routes when showRoutes is off', async () => {
    const { service } = makeService({ profilePublic: true, showRoutes: false });

    const profile = await service.findPublicProfile(VISITOR, OWNER);

    expect(profile.visible).toBe(true);
    expect(profile.showRoutes).toBe(false);
    expect(profile.runs?.[0]).toMatchObject({ id: 'run-1', route: null });
  });

  it('serves the route itself once the owner opted in (RUN-54)', async () => {
    const { service } = makeService({ profilePublic: true, showRoutes: true });

    const profile = await service.findPublicProfile(VISITOR, OWNER);

    expect(profile.showRoutes).toBe(true);
    expect(profile.runs?.[0].route).toEqual({
      polyline: RUN_ROUTE.routePolyline,
      waypoints: RUN_ROUTE.routeWaypoints,
      source: RUN_ROUTE.routeSource,
    });
  });

  // The owner's own profile ignores the toggles entirely (AC3), routes
  // included: showRoutes gates what OTHERS see.
  it('serves the owner their own route even with showRoutes off', async () => {
    const { service } = makeService({
      profilePublic: false,
      showRoutes: false,
    });

    const profile = await service.findPublicProfile(OWNER, OWNER);

    expect(profile.runs?.[0].route).toMatchObject({
      polyline: RUN_ROUTE.routePolyline,
    });
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
