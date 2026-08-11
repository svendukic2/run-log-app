import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
// Caps the work a single request can ask for; the frontend pages at 20.
export const MAX_PAGE_SIZE = 100;

// Query strings arrive as strings, and the app-wide ValidationPipe has
// transform: true but not enableImplicitConversion, so @Type does the
// string -> number step explicitly. 1-based pages: ?page=1 is the first.
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}
