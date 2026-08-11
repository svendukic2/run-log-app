import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { NormalizeEmail } from './signup.dto';

// Login validates shape only (is it an email, is a password present) and
// deliberately nothing about password length: whether the credentials are
// wrong is the service's single generic 401 (AC3), never a validation
// message that hints at what a real password here would look like.
export class LoginDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @IsString({ message: 'password must be a string' })
  @IsNotEmpty({ message: 'password must not be empty' })
  password!: string;
}
