import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RoutesService, type RoutePlanResponse } from './routes.service';

// ---------------------------------------------------------------------------
// LIVE smoke test - skipped by default, and CI never runs it (RUN-53 AC4).
// ---------------------------------------------------------------------------
// Everything in routes.service.spec.ts stubs fetch, which proves our mapping
// but cannot catch the provider changing its response shape under us. This one
// test calls the real openrouteservice and is the only thing that would.
//
// Why it is never on in CI: it needs a real ROUTING_API_KEY (a secret CI does
// not have and should not need for a green build), it spends free-tier quota
// on every run, and it fails when the provider has an outage - which is a fact
// about the internet, not about the pull request. A red build nobody trusts is
// worse than no build.
//
// To run it locally, from backend/:
//
//     ROUTING_LIVE_SMOKE=1 npm test -- routes.live-smoke
//
// with ROUTING_API_KEY set in backend/.env or the shell. Do this when the
// provider or the profile changes, and when reviewing a change to
// normaliseRoute in routes.service.ts.

const LIVE = process.env.ROUTING_LIVE_SMOKE === '1';

// Brandenburg Gate to Museum Island: about 2 km on foot through the middle of
// Berlin, so the answer is stable, walkable, and obviously wrong if the
// provider silently hands back a car route down Unter den Linden instead.
const START = { lat: 52.516275, lng: 13.377704 };
const FINISH = { lat: 52.520008, lng: 13.404954 };

const describeLive = LIVE ? describe : describe.skip;

describeLive('RoutesService against the live provider', () => {
  let service: RoutesService;

  beforeAll(async () => {
    // Reads the real backend/.env values from the shell environment, unlike
    // the unit spec's stub ConfigService.
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoutesService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => process.env[key] },
        },
      ],
    }).compile();

    service = moduleRef.get(RoutesService);
  });

  it('plans a real walking route and returns a plausible polyline and distance', async () => {
    const route: RoutePlanResponse = await service.plan({
      start: START,
      finish: FINISH,
    });

    expect(route.source).toBe('openrouteservice');
    expect(route.profile).toBe('foot-walking');

    // A street-snapped 2 km line has hundreds of points, so the encoding is
    // long; a straight two-point line would be a couple of dozen characters
    // and is the failure this length check is really looking for.
    expect(route.polyline.length).toBeGreaterThan(100);

    // Wide bounds on purpose: the exact metres change whenever the underlying
    // OSM data does, and pinning them would make this test a maintenance
    // chore. Anything in here means a real walking route was returned; the
    // 1.4 km straight-line distance is the floor.
    expect(route.distanceKm).toBeGreaterThan(1.4);
    expect(route.distanceKm).toBeLessThan(6);

    // Roughly 5 km/h, so ~25-45 min for this distance. A car route would come
    // back in single-digit minutes, which is the profile regression this
    // catches.
    expect(route.durationSeconds).toBeGreaterThan(900);
  }, 20_000);
});
