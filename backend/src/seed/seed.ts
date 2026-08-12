// `npm run seed` (RUN-71). A standalone command a human invokes, and only a
// human: nothing in render.yaml's buildCommand or startCommand reaches this
// file, and nothing should ever be added that does (AC5).
//
// It runs from the COMPILED output (`nest build && node dist/seed/seed.js`,
// see package.json) rather than through ts-node. Not a style choice: the
// Prisma 7 generated client uses ESM-style relative specifiers that ts-node's
// CommonJS resolution cannot follow - the same incompatibility jest.shared.js
// works around for the test suites. The compiled path is the one main.ts
// already runs on in production, so the seeder cannot break in a way the
// server would not.
//
// It boots a Nest application context rather than constructing its own
// PrismaClient: that reuses env validation, ConfigModule and PrismaService
// exactly as the server does, so the seeder connects the way the app does or
// fails the same way the app would.
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEMO_PASSWORD,
  DEMO_PRIMARY_EMAIL,
  DEMO_USER_COUNT,
} from './demo-data';
import { seedDemoData } from './seed-demo-data';

// The explicit opt-in that AC5's guard demands. `npm run seed -- --force`.
const FORCE_FLAG = '--force';

async function main(): Promise<void> {
  const forced = process.argv.includes(FORCE_FLAG);

  // The seeder DELETES every account on the demo email domain before it
  // writes. That is harmless on a laptop and unwelcome on a live deployment,
  // so production has to be asked for by name. Deliberately a refusal rather
  // than a prompt: this has to behave the same way when something automated
  // reaches it, and an automated caller cannot answer a prompt.
  if (process.env.NODE_ENV === 'production' && !forced) {
    console.error(
      `Refusing to seed with NODE_ENV=production. This command deletes and rewrites every demo account. Re-run with ${FORCE_FLAG} if that is genuinely what you want.`,
    );
    process.exitCode = 1;
    return;
  }

  const context = await NestFactory.createApplicationContext(AppModule, {
    // The seeder's own output is the point; Nest's module-initialisation
    // banner is not.
    logger: ['error', 'warn'],
  });

  try {
    const summary = await seedDemoData(context.get(PrismaService));
    console.log(
      [
        `Seeded ${summary.users} demo accounts (${summary.removedUsers} removed first), ` +
          `${summary.runs} runs, ${summary.follows} follows, ` +
          `${summary.notifications} notifications and ${summary.events} active event.`,
        `Sign in as ${DEMO_PRIMARY_EMAIL} with the password: ${DEMO_PASSWORD}`,
        `The same password works for all ${DEMO_USER_COUNT} demo accounts.`,
      ].join('\n'),
    );
  } finally {
    // Closes the context, which fires PrismaService.onModuleDestroy and
    // disconnects; without it the process hangs on an open pool.
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error('Seeding failed, nothing was written:', error);
  process.exitCode = 1;
});
