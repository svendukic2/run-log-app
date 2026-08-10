// The e2e suite wipes tables between tests, so it must never point at a
// development database. This derives the URL the suite is allowed to use:
// DATABASE_URL_TEST wins when set; otherwise the database name from
// DATABASE_URL gets a _test suffix (runlog -> runlog_test). Anything whose
// final database name does not end in _test is refused loudly.
//
// The jest process does not go through Nest's ConfigModule, so backend/.env
// is loaded here.
import 'dotenv/config';

export function testDatabaseUrl(): string {
  const explicit = process.env.DATABASE_URL_TEST;
  const base = explicit ?? process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL (or DATABASE_URL_TEST) must be set to run the e2e suite. Copy backend/.env.example to backend/.env and fill it in.',
    );
  }

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '');

  if (!explicit) {
    if (name.endsWith('_test')) {
      // A DATABASE_URL that already ends in _test is ambiguous: it might be
      // a database someone actively develops against, and "derived" would
      // equal "source", so the suite would wipe it. Make the intent
      // explicit instead of guessing.
      throw new Error(
        `DATABASE_URL already points at "${name}". If that is really the e2e database, set DATABASE_URL_TEST to it explicitly; the suite refuses to guess.`,
      );
    }
    url.pathname = `/${name}_test`;
  }

  const finalName = url.pathname.replace(/^\//, '');
  if (!finalName.endsWith('_test')) {
    throw new Error(
      `Refusing to run the e2e suite against "${finalName}": the suite deletes rows between tests, so its database name must end in _test.`,
    );
  }
  return url.toString();
}
