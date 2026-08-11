import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { PASSWORD_MAX_BYTES, SignupDto } from './signup.dto';

// Direct class-validator runs against the DTOs: the trickiest logic here is
// the byte-length cap and the NFC/canonicalization transforms, and they need
// no HTTP server to be proven. plainToInstance applies the @Transform
// pipeline, matching what the ValidationPipe (transform: true) does in
// production. Non-ASCII inputs are spelled with \u escapes so no editor or
// tool can silently recompose them and hollow the tests out.

// U+0107 = precomposed 'c with acute', 2 UTF-8 bytes per repetition.
const TWO_BYTE_CHAR = '\u0107';

function validSignup(): Record<string, unknown> {
  return {
    email: 'ana@example.com',
    password: 'correct horse battery staple',
    firstName: 'Ana',
    lastName: 'Anic',
  };
}

function signupInstance(overrides: Record<string, unknown>): SignupDto {
  return plainToInstance(SignupDto, { ...validSignup(), ...overrides });
}

async function signupErrors(overrides: Record<string, unknown>) {
  return validate(signupInstance(overrides));
}

describe('SignupDto', () => {
  it('accepts the baseline payload', async () => {
    expect(await signupErrors({})).toHaveLength(0);
  });

  describe('password byte cap (bcrypt truncates at 72 BYTES, not characters)', () => {
    it('accepts exactly 72 single-byte characters', async () => {
      expect(await signupErrors({ password: 'a'.repeat(72) })).toHaveLength(0);
    });

    it('rejects 73 single-byte characters', async () => {
      const errors = await signupErrors({ password: 'a'.repeat(73) });
      expect(errors).toHaveLength(1);
      expect(JSON.stringify(errors[0].constraints)).toContain('bytes');
    });

    it('rejects 72 two-byte characters (144 bytes), which MaxLength would wave through', async () => {
      // 72 of these pass a code-point cap but bcrypt would silently hash
      // only the first 36 - the truncation this cap exists to prevent.
      expect(
        await signupErrors({ password: TWO_BYTE_CHAR.repeat(72) }),
      ).toHaveLength(1);
    });

    it('accepts 36 two-byte characters (exactly 72 bytes)', async () => {
      expect(
        await signupErrors({ password: TWO_BYTE_CHAR.repeat(36) }),
      ).toHaveLength(0);
    });
  });

  describe('NFC canonicalization', () => {
    it('normalizes a decomposed (NFD) password to the composed form', () => {
      const nfd = 'pa\u0308ssword1'; // 'a' + combining diaeresis (NFD)
      const nfc = 'p\u00e4ssword1'; // precomposed 'a-umlaut' (NFC)
      const dto = signupInstance({ password: nfd });
      expect(dto.password).toBe(nfc);
      expect(dto.password).not.toBe(nfd);
    });

    it('normalizes email case, whitespace and composition to one canonical spelling', () => {
      const dto = signupInstance({ email: '  Ana\u0308@Example.COM ' });
      expect(dto.email).toBe('an\u00e4@example.com');
    });
  });

  it('trims names and rejects whitespace-only ones', async () => {
    expect(signupInstance({ firstName: '  Ana  ' }).firstName).toBe('Ana');
    expect(await signupErrors({ firstName: '   ' })).toHaveLength(1);
  });
});

describe('LoginDto', () => {
  it('applies the same email normalization and password byte cap as signup', async () => {
    const dto = plainToInstance(LoginDto, {
      email: ' Ana@Example.COM ',
      password: TWO_BYTE_CHAR.repeat(PASSWORD_MAX_BYTES), // 144 bytes
    });
    expect(dto.email).toBe('ana@example.com');
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors[0].constraints)).toContain('bytes');
  });

  it('says nothing about password correctness, only shape', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'ana@example.com',
      // Shorter than signup's minimum on purpose: login must not hint at
      // what a valid password looks like.
      password: 'x',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
