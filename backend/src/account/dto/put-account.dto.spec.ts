import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PutAccountDto } from './put-account.dto';

// Direct class-validator runs against the DTO, the same approach as the
// profile and signup DTO specs: plainToInstance applies the @Transform
// pipeline (trims, email normalization), matching the app-wide
// ValidationPipe (transform: true).

function validAccount(): Record<string, unknown> {
  return {
    firstName: 'Ana',
    lastName: 'Anić',
    email: 'ana@example.com',
  };
}

function instance(overrides: Record<string, unknown>): PutAccountDto {
  return plainToInstance(PutAccountDto, { ...validAccount(), ...overrides });
}

async function errorsFor(overrides: Record<string, unknown>) {
  return validate(instance(overrides));
}

describe('PutAccountDto', () => {
  it('accepts the baseline payload', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('requires every field: PUT is a full replace of the identity', async () => {
    const errors = await validate(plainToInstance(PutAccountDto, {}));
    expect(errors.map((error) => error.property).sort()).toEqual([
      'email',
      'firstName',
      'lastName',
    ]);
  });

  it('trims names and rejects whitespace-only ones', async () => {
    expect(instance({ firstName: '  Ana  ' }).firstName).toBe('Ana');
    expect(await errorsFor({ firstName: '   ' })).toHaveLength(1);
    expect(await errorsFor({ lastName: '   ' })).toHaveLength(1);
  });

  it('rejects a malformed email', async () => {
    const errors = await errorsFor({ email: 'ana.example.com' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('email');
  });

  it('normalizes the email to one canonical spelling (the login credential)', async () => {
    // The User.email unique index compares bytes, so a Settings edit must
    // produce the same spelling signup would have stored.
    const dto = instance({ email: '  Ana@Example.COM ' });
    expect(dto.email).toBe('ana@example.com');
    expect(await validate(dto)).toHaveLength(0);
  });
});
