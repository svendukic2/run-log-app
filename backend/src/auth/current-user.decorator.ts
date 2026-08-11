import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from './jwt-auth.guard';

// Hands a controller the user the global JwtAuthGuard attached to the
// request. Only meaningful on protected routes: on a @Public() route the
// guard never ran, so this would be undefined - which is why the decorator
// throws loudly there instead of quietly typing undefined as a user.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<Partial<AuthenticatedRequest>>();
    if (!request.user) {
      throw new Error(
        '@CurrentUser() used on a route the JwtAuthGuard did not run on (is it marked @Public()?)',
      );
    }
    return request.user;
  },
);
