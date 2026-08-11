import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { PaginationQueryDto } from '../common/pagination-query.dto';
import {
  FollowService,
  type FollowListResponse,
  type FollowStateResponse,
} from './follow.service';

// The follow API (RUN-61), under the global 'api' prefix:
//   POST   /api/users/:id/follow   follow user :id
//   DELETE /api/users/:id/follow   unfollow user :id
//   GET    /api/me/followers       who follows me (paginated)
//   GET    /api/me/following       who I follow (paginated)
// Two path roots, one controller: both are views of the same Follow edge,
// so the class anchors at the router root and each handler names its full
// path. All four require a token (global JwtAuthGuard, no @Public here);
// the caller is always the follower/"me" side.
@Controller()
export class FollowController {
  constructor(private readonly follow: FollowService) {}

  // 200 rather than 201: this is "ensure I follow them", and by AC1 the
  // repeat call answers exactly like the first, so no response ever claims
  // a row was created.
  @Post('users/:id/follow')
  @HttpCode(HttpStatus.OK)
  followUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<FollowStateResponse> {
    return this.follow.follow(user.id, id);
  }

  // 204 like the runs delete: nothing useful to return. Idempotent, so
  // unfollowing someone you never followed also lands here.
  @Delete('users/:id/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  unfollowUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.follow.unfollow(user.id, id);
  }

  @Get('me/followers')
  followers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<FollowListResponse> {
    return this.follow.followers(user.id, query);
  }

  @Get('me/following')
  following(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<FollowListResponse> {
    return this.follow.following(user.id, query);
  }
}
