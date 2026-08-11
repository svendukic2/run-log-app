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

// The query as the WHERE clause needs it: trimmed, split on whitespace and
// capped. Exported for the spec, which asserts the "ana tes" case directly.
export function searchTerms(raw: string | undefined): string[] {
  return (raw ?? '')
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .slice(0, MAX_SEARCH_TERMS);
}
