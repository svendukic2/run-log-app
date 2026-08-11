import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isRealCalendarDay, mondayOf } from '../common/dates';

// Validates the :weekStart route param: a real calendar day that IS a
// Monday. Weeks are keyed by their Monday throughout the app (frontend
// startOfWeek, the (userId, weekStart) unique constraint), so a mid-week
// date here is a caller bug worth a loud 400, not something to silently
// snap to its Monday - snapping would make two different URLs name the
// same row and hide the bug that produced the stray date.
@Injectable()
export class WeekStartPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isRealCalendarDay(value)) {
      throw new BadRequestException(
        'weekStart must be a real yyyy-mm-dd calendar day',
      );
    }
    if (mondayOf(value) !== value) {
      throw new BadRequestException(
        `weekStart must be a Monday (the week containing ${value} starts on ${mondayOf(value)})`,
      );
    }
    return value;
  }
}
