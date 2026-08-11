import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// AC1: minimum 8 characters. The maximum exists because bcrypt only hashes
// the first 72 bytes of its input - a longer password would be silently
// truncated, so two "different" long passwords could collide. Rejecting is
// honest, truncating is not.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

// Same rationale as ROUTE_NAME_MAX_LENGTH in the runs DTOs: not policing
// real input, keeping a stray script from storing megabytes in TEXT columns.
export const NAME_MAX_LENGTH = 120;
// RFC 5321's practical ceiling for a whole address.
export const EMAIL_MAX_LENGTH = 254;

// Emails are compared case-insensitively everywhere in practice, and the
// User.email column is UNIQUE, so the API stores one canonical spelling:
// trimmed and lowercased at the DTO boundary. Signup and login share this
// transform, which is what makes "Ana@Example.com" log into the account
// created as "ana@example.com".
export function NormalizeEmail() {
  return Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
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

  // Deliberately NOT trimmed: a leading or trailing space is part of the
  // password the user chose, and trimming here but nowhere else would lock
  // them out.
  @IsString({ message: 'password must be a string' })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `password must be at most ${PASSWORD_MAX_LENGTH} characters`,
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
