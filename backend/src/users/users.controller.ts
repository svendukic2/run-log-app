import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { UserSearchQueryDto } from './user-search-query.dto';
import {
  UsersService,
  type PublicProfileResponse,
  type UserSearchResponse,
} from './users.service';

// Reads of other accounts, under the global 'api' prefix:
//   GET /api/users?search=   runners matching a name (RUN-62)
//   GET /api/users/:id       one runner's public profile (RUN-63)
// Both live here rather than bolted onto the follow controller, which is
// what RUN-63 shaped this module for.
//
// Signed in like everything else (global JwtAuthGuard, no @Public here):
// public means "public to other runners", not "public to the internet", and
// the viewer's identity is what decides whether the body is served at all.
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Declared before ':id' so the collection route is never mistaken for a
  // user whose id happens to be empty.
  @Get()
  search(
    @CurrentUser() viewer: AuthenticatedUser,
    @Query() query: UserSearchQueryDto,
  ): Promise<UserSearchResponse> {
    return this.users.searchUsers(viewer.id, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() viewer: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PublicProfileResponse> {
    return this.users.findPublicProfile(viewer.id, id);
  }
}
