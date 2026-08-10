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
} from '@nestjs/common';
import { CreateRunDto } from './dto/create-run.dto';
import { UpdateRunDto } from './dto/update-run.dto';
import { RunsService, type RunResponse } from './runs.service';

// Served under the global 'api' prefix (main.ts): GET/POST /api/runs,
// GET/PATCH/DELETE /api/runs/:id. Bodies are validated by the app-wide
// ValidationPipe (registered as APP_PIPE in AppModule).
@Controller('runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get()
  findAll(): Promise<RunResponse[]> {
    return this.runs.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<RunResponse> {
    return this.runs.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRunDto): Promise<RunResponse> {
    return this.runs.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRunDto,
  ): Promise<RunResponse> {
    return this.runs.update(id, dto);
  }

  // 204: a delete has no body to return, and the frontend's deleteRun only
  // cares that it worked.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.runs.remove(id);
  }
}
