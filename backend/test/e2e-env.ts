// Runs in every jest worker before any test module loads (setupFiles).
// Shell environment beats backend/.env in ConfigModule, so overriding
// process.env here is what points the booted AppModule - and PrismaService
// with it - at the _test database instead of the developer's data.
import { testDatabaseUrl } from './test-database';

process.env.DATABASE_URL = testDatabaseUrl();

// Deterministic on purpose, and set unconditionally for the same reason as
// DATABASE_URL above: the auth e2e spec decodes tokens it minted itself, so
// whatever a developer's .env holds must not leak into the suite. Never a
// real secret - it is committed.
process.env.JWT_SECRET = 'e2e-only-jwt-secret-0000000000000000';
