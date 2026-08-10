import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { testDatabaseUrl } from './test-database';

// Runs once before the e2e suite: makes sure the _test database exists and
// carries the committed migrations, so `npm run test:e2e` works on a fresh
// clone (and in CI) with no manual test-database bookkeeping.
export default async function globalSetup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const database = url.pathname.replace(/^\//, '');

  // Re-asserted HERE, immediately before the destructive commands, not only
  // inside testDatabaseUrl: this file is the one that actually creates and
  // migrates, and its safety must not depend on a helper nobody re-reads.
  if (!database.endsWith('_test')) {
    throw new Error(
      `global-setup refusing to touch database "${database}": migrations and wipes only run against a *_test database.`,
    );
  }

  // CREATE DATABASE cannot run inside the target database, so connect to
  // the postgres maintenance database on the same server. 42P04 = already
  // exists, the expected case on every run after the first; 42501 = the
  // role lacks CREATEDB, which deserves a message that names the ways out.
  const admin = new URL(url.toString());
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${database}"`);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '42501') {
      throw new Error(
        `Your Postgres role may not create databases (CREATEDB). Either grant it, create "${database}" manually once, or point DATABASE_URL_TEST at an existing *_test database.`,
      );
    }
    if (code !== '42P04') throw error;
  } finally {
    await client.end();
  }

  // deploy, not dev: applies the committed migrations verbatim and fails
  // loudly on drift instead of trying to repair anything. DATABASE_URL is
  // passed explicitly on the spawn; the child's prisma.config.ts also runs
  // `import 'dotenv/config'` against backend/.env (the DEV url), and only
  // dotenv's do-not-override-existing-env default keeps that harmless.
  // That default is load-bearing - never switch the config to
  // dotenv's { override: true }.
  execSync('npx prisma migrate deploy', {
    cwd: `${__dirname}/..`,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
