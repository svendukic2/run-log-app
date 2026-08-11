import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, type AuthResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { Public } from './public.decorator';

// Served under the global 'api' prefix (main.ts): POST /api/auth/signup,
// POST /api/auth/login. Bodies are validated by the app-wide ValidationPipe
// (APP_PIPE in AppModule), same as the runs endpoints. @Public on the whole
// controller: these are the two endpoints that EXCHANGE credentials for a
// token, so demanding a token here would lock everyone out (RUN-57).
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto): Promise<AuthResponse> {
    return this.auth.signup(dto);
  }

  // 200, not the POST default 201: login creates nothing, it exchanges
  // credentials for a token.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }
}
