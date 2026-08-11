import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const VALID = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/runlog',
    JWT_SECRET: 'a-perfectly-fine-test-secret-32-chars-long',
  };

  it('passes a valid environment through unchanged', () => {
    expect(validateEnv(VALID)).toBe(VALID);
  });

  it('accepts both postgres:// and postgresql:// schemes and a valid PORT', () => {
    expect(() =>
      validateEnv({ ...VALID, DATABASE_URL: 'postgres://u:p@host:5432/db' }),
    ).not.toThrow();
    expect(() => validateEnv({ ...VALID, PORT: '3000' })).not.toThrow();
  });

  it('rejects a missing JWT_SECRET with the copy-the-template hint (RUN-56)', () => {
    const { JWT_SECRET, ...withoutSecret } = VALID;
    void JWT_SECRET;
    expect(() => validateEnv(withoutSecret)).toThrow(/JWT_SECRET is not set/);
    expect(() => validateEnv(withoutSecret)).toThrow(/\.env\.example/);
  });

  it('rejects the unedited JWT_SECRET placeholder specifically', () => {
    expect(() =>
      validateEnv({
        ...VALID,
        JWT_SECRET: '<generate-a-random-secret-at-least-32-chars>',
      }),
    ).toThrow(/placeholder from \.env\.example/);
  });

  it('rejects a JWT_SECRET shorter than 32 characters by its length', () => {
    expect(() => validateEnv({ ...VALID, JWT_SECRET: 'secret123' })).toThrow(
      /JWT_SECRET must be at least 32 characters, got 9/,
    );
  });

  it('sits exactly on the documented 32-character boundary', () => {
    // .env.example promises "minimum 32 characters": exactly 32 must pass,
    // 31 must fail, or following the template's own instructions produces a
    // rejected secret.
    expect(() =>
      validateEnv({ ...VALID, JWT_SECRET: 'x'.repeat(32) }),
    ).not.toThrow();
    expect(() => validateEnv({ ...VALID, JWT_SECRET: 'x'.repeat(31) })).toThrow(
      /got 31/,
    );
  });

  it('treats DATABASE_URL + JWT_SECRET as the complete boot-required set', () => {
    // VALID above is exactly that minimal set; this test exists so that a
    // future variable added to VALID without being consciously documented
    // as boot-required has one place that fails and asks the question.
    expect(Object.keys(VALID).sort()).toEqual(['DATABASE_URL', 'JWT_SECRET']);
  });

  it('rejects a missing DATABASE_URL with the copy-the-template hint', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL is not set/);
    expect(() => validateEnv({})).toThrow(/\.env\.example/);
  });

  it('rejects a DATABASE_URL with the wrong scheme by name and value', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'mysql://u:p@host:3306/db' }),
    ).toThrow(/must start with postgresql:\/\/ \(got "mysql:/);
  });

  it('rejects the unedited .env.example placeholder specifically', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://postgres:<password>@localhost:5432/runlog',
      }),
    ).toThrow(/placeholder from \.env\.example/);
  });

  it.each(['yes-please', '0', '70000', '-1'])(
    'rejects PORT "%s" as out of range or non-numeric',
    (port) => {
      expect(() => validateEnv({ ...VALID, PORT: port })).toThrow(
        /PORT must be a number in 1-65535/,
      );
    },
  );

  describe('routing config (RUN-53), optional on purpose', () => {
    it('boots with no ROUTING_ variables at all', () => {
      // The whole point of keeping these optional: a clone with no routing key
      // runs everything except POST /api/routes/plan, which answers 503 with a
      // typed body instead of taking the app down at startup.
      expect(() => validateEnv(VALID)).not.toThrow();
    });

    it('accepts a real-looking key and base URL', () => {
      expect(() =>
        validateEnv({
          ...VALID,
          ROUTING_API_KEY: '5b3ce35978511100000000004example',
          ROUTING_BASE_URL: 'http://localhost:8080/ors',
        }),
      ).not.toThrow();
    });

    it('rejects the unedited ROUTING_API_KEY placeholder', () => {
      // A pasted-but-unedited template line otherwise reaches the provider and
      // comes back as a 403 the operator has to go hunting for.
      expect(() =>
        validateEnv({
          ...VALID,
          ROUTING_API_KEY: '<your-openrouteservice-api-key>',
        }),
      ).toThrow(/ROUTING_API_KEY still contains a "<\.\.\.>" placeholder/);
    });

    it('rejects a ROUTING_BASE_URL that is not an http(s) URL', () => {
      expect(() =>
        validateEnv({ ...VALID, ROUTING_BASE_URL: 'localhost:8080' }),
      ).toThrow(/ROUTING_BASE_URL must be an http\(s\) URL/);
    });

    it('treats an empty ROUTING_BASE_URL as unset, not as a bad URL', () => {
      // ROUTING_BASE_URL= in a .env means "I did not set this"; the service
      // falls back to the hosted provider either way.
      expect(() =>
        validateEnv({ ...VALID, ROUTING_BASE_URL: '' }),
      ).not.toThrow();
    });
  });

  it('reports every problem at once instead of one per boot attempt', () => {
    let message = '';
    try {
      validateEnv({ PORT: 'nope' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('PORT');
    // The JWT_SECRET checks must participate in the same aggregate rather
    // than short-circuiting, or a fresh clone fixes one variable per boot
    // attempt - the loop this test exists to prevent.
    expect(message).toContain('JWT_SECRET');
  });
});
