import { testDatabaseUrl } from './test-database';

// Unit tests for the derivation, living in the e2e config's scope because
// the helper does. This is the single function whose failure wipes a
// development database, so every branch is pinned.
describe('testDatabaseUrl', () => {
  const saved = {
    url: process.env.DATABASE_URL,
    test: process.env.DATABASE_URL_TEST,
  };

  afterEach(() => {
    if (saved.url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved.url;
    if (saved.test === undefined) delete process.env.DATABASE_URL_TEST;
    else process.env.DATABASE_URL_TEST = saved.test;
  });

  function withEnv(url: string | undefined, testUrl: string | undefined) {
    if (url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = url;
    if (testUrl === undefined) delete process.env.DATABASE_URL_TEST;
    else process.env.DATABASE_URL_TEST = testUrl;
  }

  it('suffixes the database name and touches nothing else', () => {
    withEnv('postgresql://postgres:postgres@localhost:5432/runlog', undefined);
    expect(testDatabaseUrl()).toBe(
      'postgresql://postgres:postgres@localhost:5432/runlog_test',
    );
  });

  it('keeps query parameters out of the database name', () => {
    // Naive last-slash surgery would produce "runlog?schema=public_test".
    withEnv(
      'postgresql://u:p@localhost:5432/runlog?schema=public&sslmode=require',
      undefined,
    );
    const url = new URL(testDatabaseUrl());
    expect(url.pathname).toBe('/runlog_test');
    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('survives an URL-encoded password full of special characters', () => {
    withEnv('postgresql://user:p%40ss%2Fword@localhost:5432/runlog', undefined);
    const url = new URL(testDatabaseUrl());
    expect(url.pathname).toBe('/runlog_test');
    expect(url.password).toBe('p%40ss%2Fword');
  });

  it('lets an explicit DATABASE_URL_TEST win over derivation', () => {
    withEnv(
      'postgresql://postgres:postgres@localhost:5432/runlog',
      'postgresql://postgres:postgres@otherhost:5433/integration_test',
    );
    expect(testDatabaseUrl()).toBe(
      'postgresql://postgres:postgres@otherhost:5433/integration_test',
    );
  });

  it('refuses an explicit DATABASE_URL_TEST that does not end in _test', () => {
    withEnv(undefined, 'postgresql://postgres:postgres@localhost:5432/runlog');
    expect(() => testDatabaseUrl()).toThrow(/must end in _test/);
  });

  it('refuses to guess when DATABASE_URL itself already ends in _test', () => {
    withEnv(
      'postgresql://postgres:postgres@localhost:5432/runlog_test',
      undefined,
    );
    expect(() => testDatabaseUrl()).toThrow(/refuses to guess/);
  });

  it('demands configuration instead of running against nothing', () => {
    withEnv(undefined, undefined);
    expect(() => testDatabaseUrl()).toThrow(/DATABASE_URL/);
  });
});
