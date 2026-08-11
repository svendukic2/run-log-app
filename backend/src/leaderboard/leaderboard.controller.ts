import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import {
  LeaderboardService,
  type LeaderboardResponse,
} from './leaderboard.service';

// The global weekly leaderboard (RUN-70), under the global 'api' prefix:
//   GET /api/leaderboard[?weekStart=yyyy-mm-dd]
// One endpoint, one screen. A token is required (global JwtAuthGuard, no
// @Public here): the board is a community feature, and the caller's own row
// is part of the answer.
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  weeklyBoard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LeaderboardQueryDto,
  ): Promise<LeaderboardResponse> {
    return this.leaderboard.weeklyBoard(user.id, query);
  }
}
