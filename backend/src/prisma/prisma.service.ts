import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// The single database entry point: every feature module injects this service
// instead of constructing its own PrismaClient (one connection pool per app).
// Prisma 7 has no url in the schema, so the connection string comes in from
// ConfigService here, and from prisma.config.ts for the CLI - both read
// backend/.env.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (!connectionString) {
      // validateEnv already fails the boot for a missing variable; this
      // guard is for the other way in (unit tests, a future module wiring
      // its own ConfigService) and doubles as the narrowing for TypeScript.
      throw new Error(
        'DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.',
      );
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  // Connect eagerly so a wrong DATABASE_URL fails at startup, not on the
  // first request that happens to hit the database.
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
