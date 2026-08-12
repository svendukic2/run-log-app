import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { PaginationQueryDto } from '../common/pagination-query.dto';
import { CreateRunDto } from './dto/create-run.dto';
import { UpdateRunDto } from './dto/update-run.dto';
import {
  RunsService,
  type RunListResponse,
  type RunResponse,
} from './runs.service';

// Served under the global 'api' prefix (main.ts): GET/POST /api/runs,
// GET/PATCH/DELETE /api/runs/:id. Bodies are validated by the app-wide
// ValidationPipe (APP_PIPE in AppModule). Protected by the global
// JwtAuthGuard since RUN-57: every handler receives the verified caller
// via @CurrentUser and scopes to them.
@Controller('runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  // Paginated since RUN-79: ?page and ?pageSize through the shared
  // PaginationQueryDto, answering the shared envelope. The frontend store
  // walks every page, so what this bounds is one request's work, never the
  // history a screen computes from.
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<RunListResponse> {
    return this.runs.findAll(user.id, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RunResponse> {
    return this.runs.findOne(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRunDto,
  ): Promise<RunResponse> {
    return this.runs.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRunDto,
  ): Promise<RunResponse> {
    return this.runs.update(user.id, id, dto);
  }

  // 204: a delete has no body to return, and the frontend's deleteRun only
  // cares that it worked.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.runs.remove(user.id, id);
  }
}
