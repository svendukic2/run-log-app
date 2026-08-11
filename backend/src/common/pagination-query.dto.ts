// List pagination shared by every paginated endpoint (follow lists,
// notifications). Started life in the follow module (RUN-61) and moved here
// when the notifications list (RUN-65) needed the same query contract.
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
// Caps the work a single request can ask for; the frontend pages at 20.
export const MAX_PAGE_SIZE = 100;
// Bounds skip = (page - 1) * pageSize: without a ceiling, an astronomical
// page passes @IsInt (1e20 is still an "integer" to JS) and overflows the
// integer Prisma accepts for skip, turning bad input into a 500. OFFSET
// cost also grows linearly with skip, so the cap is a work bound too.
export const MAX_PAGE = 100_000;

// Query strings arrive as strings and the app-wide ValidationPipe has
// transform: true but not enableImplicitConversion, so the conversion is
// explicit here. An empty-but-present param (?page=) means "not set", not
// zero - Number('') is 0, which would 400 on @Min(1) before @IsOptional
// could skip it - so empty maps to undefined and falls back to the default.
const toOptionalNumber = ({ value }: { value: unknown }): number | undefined =>
  value === '' || value === null || value === undefined
    ? undefined
    : Number(value);

// 1-based pages: ?page=1 is the first.
export class PaginationQueryDto {
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page?: number;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}

// The one place the query's optionals become concrete numbers and a skip.
// Validation already bounded page and pageSize, so the arithmetic here can
// never overflow what Prisma accepts.
export function resolvePagination(query: PaginationQueryDto): {
  page: number;
  pageSize: number;
  skip: number;
} {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize };
}
