import { Matches } from 'class-validator';
import { IsCalendarDay } from '../../common/validation';

// GET /api/events/taggable?date=yyyy-mm-dd (RUN-76): which events the caller
// may tag a run of that date to.
//
// The date is REQUIRED, with no default of today, and that is the point: the
// answer is only meaningful for one specific day, and a caller who forgot the
// parameter would otherwise be handed today's answer for a run dated last week
// - a list of options the write path then rejects. A 400 says so immediately.
//
// No past/future bound (IsCalendarDay, not the runs DTO's
// IsRealNotFutureDate): this is a read, and asking which events cover a day is
// a fair question whatever the day is. The run form can only ask about dates it
// would accept anyway.
export class TaggableEventsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be a yyyy-mm-dd string',
  })
  @IsCalendarDay({ message: 'date must be a real calendar day' })
  date!: string;
}
