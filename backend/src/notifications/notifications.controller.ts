import {
  Controller,
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
  NotificationsService,
  type NotificationListResponse,
  type NotificationResponse,
} from './notifications.service';

// The bell's read side (RUN-65), under the global 'api' prefix:
//   GET  /api/me/notifications          newest first, paginated, unread count
//   POST /api/me/notifications/:id/read mark one read
//   POST /api/me/notifications/read-all mark everything read
// Writes have no endpoint on purpose: notifications are only ever created by
// the actions that cause them (follow, run create), inside those modules.
// All three routes require a token (global JwtAuthGuard, no @Public here);
// 'me' is always the token's user.
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<NotificationListResponse> {
    return this.notifications.list(user.id, query);
  }

  // 200 rather than 201 like the follow endpoint: this is "ensure it is
  // read", nothing is created, and the repeat call answers like the first.
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<NotificationResponse> {
    return this.notifications.markRead(user.id, id);
  }

  // No route clash with :id/read - this is one path segment, that is two.
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ updated: number }> {
    return this.notifications.markAllRead(user.id);
  }
}
