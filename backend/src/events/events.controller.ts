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
import { CreateEventDto } from './dto/create-event.dto';
import { EventListQueryDto } from './dto/event-list-query.dto';
import { TaggableEventsQueryDto } from './dto/taggable-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import {
  EventsService,
  type EventListResponse,
  type EventParticipantListResponse,
  type EventResponse,
  type EventRunListResponse,
  type TaggableEventListResponse,
} from './events.service';

// The events API (RUN-67), under the global 'api' prefix:
//   POST   /api/events           create (caller becomes owner + participant)
//   GET    /api/events           list, paginated, ?state= filterable
//   GET    /api/events/taggable?date=  events I may tag a run of that date to
//   GET    /api/events/:id       one event
//   GET    /api/events/:id/participants  members + their event standings
//   GET    /api/events/:id/runs  the runs tagged to this event
//   POST   /api/events/:id/join  join (idempotent, notifies the owner)
//   DELETE /api/events/:id/join  leave (idempotent; owner cannot)
//   PATCH  /api/events/:id       owner-only update
//   DELETE /api/events/:id       owner-only delete, cascades participants
// Everything requires a token (global JwtAuthGuard, no @Public here).
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEventDto,
  ): Promise<EventResponse> {
    return this.events.create(user.id, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EventListQueryDto,
  ): Promise<EventListResponse> {
    return this.events.list(user.id, query);
  }

  // BEFORE the ':id' route below, and this one really does need the order:
  // 'taggable' is a single path segment, so a route declared after ':id' would
  // never be reached - Nest would read it as an event id and 404. ':id/runs'
  // and ':id/participants' are safe either way (two segments); this is not.
  @Get('taggable')
  listTaggableEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TaggableEventsQueryDto,
  ): Promise<TaggableEventListResponse> {
    return this.events.listTaggableEvents(user.id, query.date);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EventResponse> {
    return this.events.findOne(user.id, id);
  }

  // The detail page's one read for both of its lists (RUN-69): the members,
  // and for those on leaderboards their ranked distance inside the event
  // window. Sits next to findOne because it reads the same event; the
  // ':id' route above cannot swallow it, since a path parameter matches one
  // segment.
  @Get(':id/participants')
  listParticipants(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EventParticipantListResponse> {
    return this.events.listParticipants(user.id, id);
  }

  // The event's run feed (RUN-76 AC2): the runs tagged to it, which is a
  // different question from the standings beside it and answered separately
  // because the detail page's two cards fail and retry independently.
  @Get(':id/runs')
  listRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EventRunListResponse> {
    return this.events.listRuns(user.id, id);
  }

  // 200 rather than 201: this is "ensure I am in", and the repeat call
  // answers exactly like the first (AC2), so no response ever claims a row
  // was created. Both membership verbs answer the updated event, so the
  // card that clicked learns the flipped flag and the fresh participant
  // count in the same round trip (review fix; the follow endpoints predate
  // this and still answer a state stub).
  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  join(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EventResponse> {
    return this.events.join(user.id, id);
  }

  // Leaving an event never joined lands here too (idempotent); the owner
  // gets a 400 instead (AC2), their membership is structural.
  @Delete(':id/join')
  leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EventResponse> {
    return this.events.leave(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ): Promise<EventResponse> {
    return this.events.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.events.remove(user.id, id);
  }
}
