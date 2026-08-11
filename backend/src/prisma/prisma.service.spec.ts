import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from './prisma.service';

// Records constructor arguments while still producing a real adapter, so
// PrismaClient's own validation of the adapter stays in play. Constructing
// PrismaPg does not open a connection (pg pools connect lazily).
jest.mock('@prisma/adapter-pg', () => {
  const actual =
    jest.requireActual<typeof import('@prisma/adapter-pg')>(
      '@prisma/adapter-pg',
    );
  return {
    ...actual,
    PrismaPg: jest.fn(
      (...args: ConstructorParameters<typeof actual.PrismaPg>) => {
        return new actual.PrismaPg(...args);
      },
    ),
  };
});

// Construction only: connecting is exercised by the e2e suite against a real
// database, not by unit tests.
describe('PrismaService', () => {
  const SENTINEL_URL =
    'postgresql://sentinel:sentinel@config-service:5432/sentinel';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function configWith(url: string | undefined) {
    return { get: jest.fn().mockReturnValue(url) };
  }

  it('is injectable through the testing module', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        { provide: ConfigService, useValue: configWith(SENTINEL_URL) },
      ],
    }).compile();

    const service = moduleRef.get(PrismaService);
    expect(service).toBeDefined();
    // The PrismaClient surface is present without any connection being made.
    expect(typeof service.$connect).toBe('function');
  });

  it('hands the adapter the connection string from ConfigService, not process.env (AC1)', async () => {
    const config = configWith(SENTINEL_URL);
    await Test.createTestingModule({
      providers: [PrismaService, { provide: ConfigService, useValue: config }],
    }).compile();

    expect(config.get).toHaveBeenCalledWith('DATABASE_URL');
    // The sentinel never exists in process.env, so seeing it reach the pg
    // adapter proves the ConfigService value is the one actually used.
    expect(PrismaPg).toHaveBeenCalledWith({ connectionString: SENTINEL_URL });
  });

  it('fails at construction with a clear message when DATABASE_URL is missing', () => {
    expect(
      () =>
        new PrismaService(configWith(undefined) as unknown as ConfigService),
    ).toThrow(/DATABASE_URL is not set/);
  });

  // The lifecycle pair. Note that in production these hooks only fire
  // because main.ts calls app.enableShutdownHooks(); the e2e suite's
  // app.close() fires them regardless, so this unit pair plus that main.ts
  // line are what keep shutdown honest.
  it('connects on module init and disconnects on module destroy', async () => {
    const service = new PrismaService(
      configWith(SENTINEL_URL) as unknown as ConfigService,
    );
    const connect = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onModuleInit();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();

    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
