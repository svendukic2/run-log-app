// Time-of-day greeting for the dashboard overline (RUN-16). Only the morning
// variant is designed; afternoon and evening follow the same shape (A5).
// The small hours (0-4) deliberately stay "Good evening": to someone still up
// at 2am it is late night, not morning.
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}
