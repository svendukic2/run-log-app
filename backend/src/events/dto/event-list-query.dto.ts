import { IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination-query.dto';
import { ValidateIfPresent } from '../../common/validation';

// The three derived lifecycle states (RUN-67 AC3), computed from the event's
// inclusive dates against today's UTC day and never stored. Lowercase like
// the notification types: these are API vocabulary, not display strings.
export const EVENT_STATES = ['upcoming', 'active', 'finished'] as const;
export type EventState = (typeof EVENT_STATES)[number];

// GET /api/events: the shared page window plus an optional state filter.
export class EventListQueryDto extends PaginationQueryDto {
  @ValidateIfPresent()
  @IsIn(EVENT_STATES, {
    message: `state must be one of: ${EVENT_STATES.join(', ')}`,
  })
  state?: EventState;
}
