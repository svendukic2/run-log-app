import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

// What the guard attaches to the request and @CurrentUser() hands to
// controllers: the verified token claims, nothing fetched from the
// database. Handlers that need more than id/email load it themselves.
export interface AuthenticatedUser {
  id: string;
  email: string;
}

// Express's Request with the property this guard adds.
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

// Registered as a global APP_GUARD in AppModule (RUN-57): every endpoint
// demands a valid Bearer token unless it (or its controller) carries
// @Public(). Verification uses the JwtService from AuthModule's exported
// JwtModule, so tokens are checked against exactly the secret and options
// they were signed with.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: { sub?: unknown; email?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      // One message for expired, malformed and wrongly-signed tokens: the
      // caller's fix is the same (sign in again), and anything more
      // specific only helps someone probing the verification.
      throw new UnauthorizedException('Invalid or expired token');
    }

    // A verified signature with a missing subject is still an unusable
    // token: reject it here rather than letting a userId of undefined
    // reach a WHERE clause.
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    (request as AuthenticatedRequest).user = {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
    };
    return true;
  }
}
