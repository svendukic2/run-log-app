import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { PutGoalDto } from './dto/put-goal.dto';
import { GoalService, type GoalResponse } from './goal.service';

// Served under the global 'api' prefix (main.ts): GET/PUT /api/goal. One
// resource per account, owner from the token via the global JwtAuthGuard,
// bodies validated by the app-wide ValidationPipe.
@Controller('goal')
export class GoalController {
  constructor(private readonly goal: GoalService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<GoalResponse> {
    return this.goal.get(user.id);
  }

  @Put()
  put(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PutGoalDto,
  ): Promise<GoalResponse> {
    return this.goal.put(user.id, dto);
  }
}
