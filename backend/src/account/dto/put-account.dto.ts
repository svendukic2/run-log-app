import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NormalizeEmail,
} from '../../auth/dto/signup.dto';

// The bounds come from the SIGNUP DTO on purpose: both DTOs write the same
// User columns, and a stricter cap here would accept a name at signup that
// this endpoint then rejects forever - locking that account out of its own
// Settings page (the identity write goes first, so the weekly default would
// be unsaveable too).
export { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH };

const trimmed = () =>
  Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  );

// PUT /api/account is a full replace of the account's IDENTITY: the Settings
// form always holds all three fields, so partial writes have no caller. The
// email reuses signup's NormalizeEmail transform - it is the login
// credential and the User.email unique index compares bytes, so the same
// canonical spelling (trimmed, lowercased, NFC) must apply on every write
// path or an address entered here would stop matching the one typed at Sign
// in.
export class PutAccountDto {
  @trimmed()
  @IsString({ message: 'firstName must be a string' })
  @IsNotEmpty({ message: 'firstName must not be empty' })
  @MaxLength(NAME_MAX_LENGTH, {
    message: `firstName must be at most ${NAME_MAX_LENGTH} characters`,
  })
  firstName!: string;

  @trimmed()
  @IsString({ message: 'lastName must be a string' })
  @IsNotEmpty({ message: 'lastName must not be empty' })
  @MaxLength(NAME_MAX_LENGTH, {
    message: `lastName must be at most ${NAME_MAX_LENGTH} characters`,
  })
  lastName!: string;

  @NormalizeEmail()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(EMAIL_MAX_LENGTH, {
    message: `email must be at most ${EMAIL_MAX_LENGTH} characters`,
  })
  email!: string;
}
