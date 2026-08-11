import { Transform } from 'class-transformer';
import { IsCalendarDay, ValidateIfPresent } from '../../common/validation';

// GET /api/leaderboard: which week to rank. Omitted means the current one,
// which is what the page asks for on its first load.
//
// Any calendar day is accepted, not only a Monday: the service normalizes
// it to the Monday of the week it falls in and echoes the resolved window
// back, so a client that sends "the day I am looking at" and one that sends
// a week start get the same, unambiguous answer.
export class LeaderboardQueryDto {
  // An empty-but-present param (?weekStart=) means "not set", exactly like
  // the events list's ?state= (the reasoning lives there): a client building
  // the URL from an unset switcher must get the current week, not a 400.
  @ValidateIfPresent()
  @Transform(({ value }): unknown => (value === '' ? undefined : value))
  @IsCalendarDay({ message: 'weekStart must be a real calendar day' })
  weekStart?: string;
}
