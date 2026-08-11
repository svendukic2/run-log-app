// Prisma CLI configuration (Prisma 7). The CLI (migrate, generate, studio)
// reads the connection URL from here; the runtime client gets it from
// PrismaService via ConfigService. Both ultimately read backend/.env, which
// dotenv loads below because the CLI runs outside Nest's ConfigModule.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Undefined is fine here: commands that don't touch the database
    // (prisma generate) work without a .env; migrate fails with Prisma's
    // own "url is missing" error, which names exactly what to fix.
    url: process.env.DATABASE_URL,
  },
});
