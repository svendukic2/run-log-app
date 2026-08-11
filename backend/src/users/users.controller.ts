import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { UsersService, type PublicProfileResponse } from './users.service';

// Reads of other accounts, under the global 'api' prefix:
//   GET /api/users/:id   one runner's public profile (RUN-63)
// RUN-62 adds GET /api/users?search= beside it, which is why this is a
// module rather than one endpoint bolted onto the follow controller.
//
// Signed in like everything else (global JwtAuthGuard, no @Public here):
// public means "public to other runners", not "public to the internet", and
// the viewer's identity is what decides whether the body is served at all.
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id')
  findOne(
    @CurrentUser() viewer: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PublicProfileResponse> {
    return this.users.findPublicProfile(viewer.id, id);
  }
}
