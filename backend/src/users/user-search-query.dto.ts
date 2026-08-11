import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination-query.dto';

// Bounds the text that reaches the LIKE. A name nobody has is still a scan,
// so the length is capped at something a real name fits in rather than at
// whatever a URL can carry.
export const MAX_SEARCH_LENGTH = 60;

// How many whitespace-separated terms are honoured. Every extra term is
// another OR pair in the WHERE, so the cap is a work bound; four is more
// than "first middle last" needs and the rest is noise.
export const MAX_SEARCH_TERMS = 4;

// GET /api/users?search= (RUN-62). Extends the shared pagination contract
// rather than restating it, so `?page` and `?pageSize` mean here exactly
// what they mean on the follow lists (and unknown params still 400 through
// the app-wide whitelist pipe).
//
// `search` is optional on purpose: the People page reads this endpoint with
// no query too, for the caller's own follow counts, and an absent or blank
// search is answered with an empty list instead of every account in the
// database.
export class UserSearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;
}

// LIKE's own wildcards, which Prisma's `contains` does NOT escape: it
// parameterizes the value and then wraps it as %value%, so a '%' the caller
// typed stays a wildcard. Left in, `?search=%` would match every account in
// the database - precisely the unbounded scan the caps above exist to
// prevent. Stripped rather than escaped because Prisma exposes no ESCAPE
// clause to escape them with, and no real name contains any of the three.
const LIKE_WILDCARDS = /[%_\\]/g;

// The query as the WHERE clause needs it: trimmed, de-wildcarded, split on
// whitespace and capped. Exported for the spec, which asserts the "ana tes"
// case directly.
export function searchTerms(raw: string | undefined): string[] {
  return (raw ?? '')
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(LIKE_WILDCARDS, ''))
    .filter((term) => term.length > 0)
    .slice(0, MAX_SEARCH_TERMS);
}
