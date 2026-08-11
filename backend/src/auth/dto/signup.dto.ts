import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

// AC1: minimum 8 characters. The maximum is enforced in UTF-8 BYTES, not
// characters, because bcrypt keys on the first 72 bytes of its input: a
// code-point cap would let a 72-character password of 2-byte characters
// (144 bytes) through, and bcrypt would silently hash only its first half -
// the account would then also authenticate with the truncated prefix.
// Rejecting is honest, truncating is not.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

// Same rationale as ROUTE_NAME_MAX_LENGTH in the runs DTOs: not policing
// real input, keeping a stray script from storing megabytes in TEXT columns.
export const NAME_MAX_LENGTH = 120;
// RFC 5321's practical ceiling for a whole address.
export const EMAIL_MAX_LENGTH = 254;

// Byte-length cap for the bcrypt input (see PASSWORD_MAX_BYTES). Own
// validator because class-validator's MaxLength counts code points.
export function MaxByteLength(
  maxBytes: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxByteLength',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === 'string' &&
            Buffer.byteLength(value, 'utf8') <= maxBytes
          );
        },
      },
    });
  };
}

// Emails are compared case-insensitively everywhere in practice, and the
// User.email column is UNIQUE, so the API stores one canonical spelling:
// trimmed, lowercased and NFC-normalized at the DTO boundary. Signup and
// login share this transform, which is what makes "Ana@Example.com" log
// into the account created as "ana@example.com". NFC because the unique
// index compares bytes: without it, the composed and decomposed spellings
// of the same accented address would be two different accounts.
export function NormalizeEmail() {
  return Transform(({ value }): unknown =>
    typeof value === 'string'
      ? value.trim().toLowerCase().normalize('NFC')
      : value,
  );
}

// Passwords are deliberately NOT trimmed (a leading space is part of the
// password the user chose), but they ARE NFC-normalized: bcrypt compares
// bytes, and the same accented character arrives composed (NFC) from most
// clients but decomposed (NFD) from e.g. macOS text stacks. Without one
// canonical form, the password that was set from one device fails from
// another with a generic 401 and no recovery path. (NIST SP 800-63B
// recommends exactly this normalization before hashing.)
export function NormalizePassword() {
  return Transform(({ value }): unknown =>
    typeof value === 'string' ? value.normalize('NFC') : value,
  );
}

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class SignupDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(EMAIL_MAX_LENGTH, {
    message: `email must be at most ${EMAIL_MAX_LENGTH} characters`,
  })
  email!: string;

  @NormalizePassword()
  @IsString({ message: 'password must be a string' })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxByteLength(PASSWORD_MAX_BYTES, {
    message: `password must be at most ${PASSWORD_MAX_BYTES} bytes of UTF-8`,
  })
  password!: string;

  // Non-empty per the Welcome form rules (WEL-5) that RUN-37 also mirrors.
  @Transform(trimString)
  @IsString({ message: 'firstName must be a string' })
  @IsNotEmpty({ message: 'firstName must not be empty' })
  @MaxLength(NAME_MAX_LENGTH, {
    message: `firstName must be at most ${NAME_MAX_LENGTH} characters`,
  })
  firstName!: string;

  @Transform(trimString)
  @IsString({ message: 'lastName must be a string' })
  @IsNotEmpty({ message: 'lastName must not be empty' })
  @MaxLength(NAME_MAX_LENGTH, {
    message: `lastName must be at most ${NAME_MAX_LENGTH} characters`,
  })
  lastName!: string;
}
