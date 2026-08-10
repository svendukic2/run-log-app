// Boot-time environment validation (closes the "no validationSchema" gap
// noted in CLAUDE.md, without adding a Joi dependency for three variables).
// ConfigModule calls this once with merged process.env + backend/.env; a
// throw here stops the app before anything half-initialises.
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];

  // Environment values are always strings; anything else stringifies for
  // the error message only.
  const asString = (value: unknown): string =>
    typeof value === 'string' ? value : JSON.stringify(value);

  // Required since RUN-46: PrismaService connects at startup. Shape-check it
  // too - the most common fresh-clone failure is not an absent value but the
  // .env.example template pasted with "<password>" left in, which would
  // otherwise surface as an opaque Prisma adapter error.
  const url =
    config.DATABASE_URL === undefined ? '' : asString(config.DATABASE_URL);
  if (!url) {
    errors.push(
      'DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.',
    );
  } else if (!/^postgres(ql)?:\/\//.test(url)) {
    errors.push(`DATABASE_URL must start with postgresql:// (got "${url}").`);
  } else if (url.includes('<')) {
    errors.push(
      'DATABASE_URL still contains a "<...>" placeholder from .env.example. Replace it with your real credentials.',
    );
  }

  // Optional with a default, but a present-and-garbage value should fail
  // here rather than as EADDRINUSE-style noise later.
  if (config.PORT !== undefined) {
    const portRaw = asString(config.PORT);
    const port = Number(portRaw);
    if (!/^\d+$/.test(portRaw) || port < 1 || port > 65535) {
      errors.push(`PORT must be a number in 1-65535, got "${portRaw}".`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid backend environment:\n- ${errors.join('\n- ')}`);
  }
  return config;
}
