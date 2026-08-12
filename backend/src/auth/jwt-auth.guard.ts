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
import { extractBearerToken } from './token-lifecycle';

// What the guard attaches to the request and @CurrentUser() hands to
// controllers: the verified subject, nothing fetched from the database.
// Deliberately ONLY the id - the token also carries an email claim, but
// exposing it here before anything consumes it would just be a second,
// possibly stale copy of what the User row already holds. Handlers that
// need more load it themselves.
export interface AuthenticatedUser {
  id: string;
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
    // The bearer grammar lives in token-lifecycle.ts since RUN-74, because
    // the refresh and logout routes parse the same header and two copies of
    // one rule is how they drift.
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: { sub?: unknown };
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

    (request as AuthenticatedRequest).user = { id: payload.sub };
    return true;
  }
}
