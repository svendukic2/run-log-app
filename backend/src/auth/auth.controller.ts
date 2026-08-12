import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { AuthService, type AuthResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { Public } from './public.decorator';
import { extractBearerToken } from './token-lifecycle';

// Served under the global 'api' prefix (main.ts): POST /api/auth/signup,
// /login, /refresh and /logout. Bodies are validated by the app-wide
// ValidationPipe (APP_PIPE in AppModule), same as the runs endpoints.
//
// @Public sits on each ROUTE rather than on the controller (it was on the
// controller until RUN-74). All four routes still end up public, but for two
// different reasons, and spelling them out one at a time keeps the
// protected-by-default rule in public.decorator.ts intact for whatever gets
// added here next:
//   - signup and login EXCHANGE credentials for a token, so demanding one
//     would lock everyone out (RUN-57).
//   - refresh and logout take a token the global guard would reject,
//     because it is allowed to be expired - renewing and revoking an expired
//     session is the point of both. They re-verify it themselves, waiving
//     only `exp`; see AuthService.verifyIgnoringExpiry.
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto): Promise<AuthResponse> {
    return this.auth.signup(dto);
  }

  // 200, not the POST default 201: login creates nothing, it exchanges
  // credentials for a token.
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  // Same 200-not-201 reasoning, and the same { token, user } body as login,
  // so the frontend can keep its stored email in step with a rename it
  // missed while the session slid along.
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Headers('authorization') header?: string): Promise<AuthResponse> {
    return this.auth.refresh(extractBearerToken(header));
  }

  // 204: there is nothing to say. Always 204, even for a missing or
  // unreadable token - see AuthService.logout for why signing out must not
  // be able to fail.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Headers('authorization') header?: string): Promise<void> {
    return this.auth.logout(extractBearerToken(header));
  }
}
