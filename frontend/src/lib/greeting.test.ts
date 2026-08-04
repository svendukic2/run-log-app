import { greetingForHour } from './greeting';

describe('greetingForHour (RUN-16)', () => {
  it.each([
    [5, 'Good morning'],
    [9, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [15, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
    [0, 'Good evening'],
    [4, 'Good evening'],
  ])('greets hour %i with "%s" (AC1, AC2)', (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected);
  });
});
