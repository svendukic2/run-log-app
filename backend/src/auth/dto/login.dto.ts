import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import {
  MaxByteLength,
  NormalizeEmail,
  NormalizePassword,
  PASSWORD_MAX_BYTES,
} from './signup.dto';

// Login validates shape only (is it an email, is a password present) and
// deliberately nothing about password CORRECTNESS: whether the credentials
// are wrong is the service's single generic 401 (AC3). The byte cap is a
// shape rule, not a credentials hint - signup enforces the same cap, so no
// real account can have a longer password, and without it an
// unauthenticated caller could feed multi-kilobyte strings into a cost-12
// bcrypt compare and stall the libuv threadpool.
export class LoginDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @NormalizePassword()
  @IsString({ message: 'password must be a string' })
  @IsNotEmpty({ message: 'password must not be empty' })
  @MaxByteLength(PASSWORD_MAX_BYTES, {
    message: `password must be at most ${PASSWORD_MAX_BYTES} bytes of UTF-8`,
  })
  password!: string;
}
