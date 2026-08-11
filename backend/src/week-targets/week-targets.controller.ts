import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { PutWeekTargetDto } from './dto/put-week-target.dto';
import { WeekStartPipe } from './week-start.pipe';
import {
  WeekTargetsService,
  type WeekTargetResponse,
} from './week-targets.service';

// Served under the global 'api' prefix (main.ts): GET /api/week-targets,
// GET/PUT /api/week-targets/:weekStart (weekStart = the week's Monday,
// yyyy-mm-dd, validated by WeekStartPipe). Owner from the token via the
// global JwtAuthGuard.
//
// GET on a single week deliberately materializes the row on first read
// (the snapshot rule, docs/data-model.md): idempotent - every later read
// returns the same row - so it is a cacheable-safe get-or-create, not a
// hidden mutation of user-visible state.
@Controller('week-targets')
export class WeekTargetsController {
  constructor(private readonly weekTargets: WeekTargetsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WeekTargetResponse[]> {
    return this.weekTargets.findAll(user.id);
  }

  @Get(':weekStart')
  ensure(
    @CurrentUser() user: AuthenticatedUser,
    @Param('weekStart', WeekStartPipe) weekStart: string,
  ): Promise<WeekTargetResponse> {
    return this.weekTargets.ensure(user.id, weekStart);
  }

  @Put(':weekStart')
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('weekStart', WeekStartPipe) weekStart: string,
    @Body() dto: PutWeekTargetDto,
  ): Promise<WeekTargetResponse> {
    return this.weekTargets.apply(user.id, weekStart, dto.targetKm);
  }
}
