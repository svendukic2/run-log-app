import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const VALID = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/runlog',
  };

  it('passes a valid environment through unchanged', () => {
    expect(validateEnv(VALID)).toBe(VALID);
  });

  it('accepts both postgres:// and postgresql:// schemes and a valid PORT', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'postgres://u:p@host:5432/db' }),
    ).not.toThrow();
    expect(() => validateEnv({ ...VALID, PORT: '3000' })).not.toThrow();
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

  it('reports every problem at once instead of one per boot attempt', () => {
    let message = '';
    try {
      validateEnv({ PORT: 'nope' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('PORT');
  });
});
