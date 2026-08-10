// Runs in every jest worker before any test module loads (setupFiles).
// Shell environment beats backend/.env in ConfigModule, so overriding
// process.env here is what points the booted AppModule - and PrismaService
// with it - at the _test database instead of the developer's data.
import { testDatabaseUrl } from './test-database';

process.env.DATABASE_URL = testDatabaseUrl();
