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

  // Required since RUN-56: AuthModule signs JWTs with it at boot. The same
  // placeholder check as DATABASE_URL catches an unedited .env.example, and
  // the length floor catches "secret123" - a guessable secret means anyone
  // can mint valid tokens.
  const secret =
    config.JWT_SECRET === undefined ? '' : asString(config.JWT_SECRET);
  if (!secret) {
    errors.push(
      'JWT_SECRET is not set. Copy backend/.env.example to backend/.env and generate one as the template describes.',
    );
  } else if (secret.includes('<')) {
    errors.push(
      'JWT_SECRET still contains a "<...>" placeholder from .env.example. Generate a real secret as the template describes.',
    );
  } else if (secret.length < 32) {
    errors.push(
      `JWT_SECRET must be at least 32 characters, got ${secret.length}. Generate a longer one as the template describes.`,
    );
  }

  // Route planning (RUN-53) is deliberately NOT boot-required, unlike the two
  // above. A clone with no routing key runs the whole app; only
  // POST /api/routes/plan answers 503 with a typed body the modal can show.
  // Making it required would break every contributor's boot for one optional
  // feature. What is checked is a value that is *present but obviously wrong*,
  // because that fails at the provider with a 403 the operator then has to go
  // hunting for.
  if (config.ROUTING_API_KEY !== undefined) {
    const key = asString(config.ROUTING_API_KEY);
    if (key.includes('<')) {
      errors.push(
        'ROUTING_API_KEY still contains a "<...>" placeholder from .env.example. Paste a real key or remove the line entirely.',
      );
    }
  }

  // Only needed to point at a self-hosted openrouteservice; the default in
  // routes.service.ts is the hosted API. A typo'd URL here would otherwise
  // surface as an unreachable-provider error on every plan request.
  if (config.ROUTING_BASE_URL !== undefined) {
    const baseUrl = asString(config.ROUTING_BASE_URL);
    if (baseUrl !== '' && !/^https?:\/\/\S+$/.test(baseUrl)) {
      errors.push(
        `ROUTING_BASE_URL must be an http(s) URL (got "${baseUrl}"). Remove the line to use the hosted provider.`,
      );
    }
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
