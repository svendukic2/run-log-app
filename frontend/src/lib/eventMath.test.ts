import {
  compareEventsChronological,
  emptyEventForm,
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_NAME_MAX_LENGTH,
  formatEventWindow,
  formatParticipantCount,
  groupEventsByState,
  isCommunityEvent,
  toEventDraft,
  todayIso,
  validateEventForm,
  type CommunityEvent,
  type EventFormValues,
} from './events';

function makeEvent(overrides: Partial<CommunityEvent> = {}): CommunityEvent {
  return {
    id: 'event-1',
    name: 'Summer 100k',
    description: '',
    startDate: '2026-08-10',
    endDate: '2026-08-16',
    targetKm: null,
    state: 'active',
    participantCount: 1,
    joined: false,
    mine: false,
    owner: { id: 'user-ana', firstName: 'Ana', lastName: 'Tester' },
    createdAt: '2026-08-11T10:00:00.000Z',
    ...overrides,
  };
}

function makeForm(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    name: 'Summer 100k',
    description: '',
    startDate: '2026-08-10',
    endDate: '2026-08-16',
    targetKm: '',
    ...overrides,
  };
}

describe('validateEventForm (RUN-68 AC3)', () => {
  it('accepts a complete form and one with only the required fields', () => {
    expect(validateEventForm(makeForm())).toEqual({});
    expect(validateEventForm(makeForm({ description: 'Run together', targetKm: '100' }))).toEqual(
      {},
    );
  });

  it('requires a non-blank name and bounds it like the API', () => {
    expect(validateEventForm(makeForm({ name: '' })).name).toBe('Event name is required');
    expect(validateEventForm(makeForm({ name: '   ' })).name).toBe('Event name is required');
    expect(
      validateEventForm(makeForm({ name: 'x'.repeat(EVENT_NAME_MAX_LENGTH + 1) })).name,
    ).toMatch(/120/);
    // At the bound is fine.
    expect(
      validateEventForm(makeForm({ name: 'x'.repeat(EVENT_NAME_MAX_LENGTH) })).name,
    ).toBeUndefined();
  });

  it('bounds the description like the API', () => {
    expect(
      validateEventForm(makeForm({ description: 'x'.repeat(EVENT_DESCRIPTION_MAX_LENGTH + 1) }))
        .description,
    ).toMatch(/2000/);
  });

  it('requires both dates and end on/after start (the date pair rule)', () => {
    expect(validateEventForm(makeForm({ startDate: '' })).startDate).toBe('Start date is required');
    expect(validateEventForm(makeForm({ endDate: '' })).endDate).toBe('End date is required');
    expect(
      validateEventForm(makeForm({ startDate: '2026-08-16', endDate: '2026-08-10' })).endDate,
    ).toBe("End date can't be before the start date");
    // A one-day event is legal, and so is a window fully in the past.
    expect(validateEventForm(makeForm({ startDate: '2020-01-01', endDate: '2020-01-01' }))).toEqual(
      {},
    );
  });

  it('accepts an empty target and rejects a non-positive or garbled one', () => {
    expect(validateEventForm(makeForm({ targetKm: '' }))).toEqual({});
    expect(validateEventForm(makeForm({ targetKm: '0' })).targetKm).toBe(
      'Enter a target greater than 0',
    );
    expect(validateEventForm(makeForm({ targetKm: '-5' })).targetKm).toBe(
      'Enter a target greater than 0',
    );
    expect(validateEventForm(makeForm({ targetKm: 'abc' })).targetKm).toBe(
      'Enter a target greater than 0',
    );
  });

  it('reports every problem at once', () => {
    const errors = validateEventForm(
      makeForm({ name: '', startDate: '2026-08-16', endDate: '2026-08-10', targetKm: '0' }),
    );
    expect(Object.keys(errors).sort()).toEqual(['endDate', 'name', 'targetKm']);
  });
});

describe('toEventDraft', () => {
  it('trims text and omits the target when blank (the API rejects null)', () => {
    const draft = toEventDraft(makeForm({ name: '  Summer 100k  ', description: ' hi ' }));
    expect(draft).toEqual({
      name: 'Summer 100k',
      description: 'hi',
      startDate: '2026-08-10',
      endDate: '2026-08-16',
    });
    expect('targetKm' in draft).toBe(false);
  });

  it('parses the target, accepting the decimal comma', () => {
    expect(toEventDraft(makeForm({ targetKm: '100' })).targetKm).toBe(100);
    expect(toEventDraft(makeForm({ targetKm: '42,5' })).targetKm).toBe(42.5);
  });
});

describe('emptyEventForm', () => {
  it('starts as a one-day event today', () => {
    const form = emptyEventForm();
    expect(form.startDate).toBe(todayIso());
    expect(form.endDate).toBe(todayIso());
    expect(form.name).toBe('');
    expect(form.targetKm).toBe('');
  });
});

describe('formatEventWindow', () => {
  it('collapses a one-day event to its single date', () => {
    expect(formatEventWindow('2026-08-11', '2026-08-11')).toBe('Aug 11, 2026');
  });

  it('writes the year once inside one year', () => {
    expect(formatEventWindow('2026-08-10', '2026-08-16')).toBe('Aug 10 – Aug 16, 2026');
  });

  it('spells out both years across a year boundary', () => {
    expect(formatEventWindow('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027');
  });
});

describe('formatParticipantCount', () => {
  it('pluralizes', () => {
    expect(formatParticipantCount(1)).toBe('1 runner');
    expect(formatParticipantCount(3)).toBe('3 runners');
  });
});

describe('groupEventsByState (AC1)', () => {
  it('buckets every event exactly once, keeping chronological order inside a bucket', () => {
    const events = [
      makeEvent({ id: 'a', state: 'finished', startDate: '2026-07-01', endDate: '2026-07-02' }),
      makeEvent({ id: 'b', state: 'active' }),
      makeEvent({ id: 'c', state: 'upcoming', startDate: '2026-09-01', endDate: '2026-09-02' }),
      makeEvent({ id: 'd', state: 'active' }),
    ];
    const groups = groupEventsByState(events);
    expect(groups.active.map((event) => event.id)).toEqual(['b', 'd']);
    expect(groups.upcoming.map((event) => event.id)).toEqual(['c']);
    expect(groups.finished.map((event) => event.id)).toEqual(['a']);
  });
});

describe('compareEventsChronological', () => {
  it('orders by start day, then id, mirroring the API', () => {
    const events = [
      makeEvent({ id: 'b', startDate: '2026-08-10' }),
      makeEvent({ id: 'a', startDate: '2026-08-10' }),
      makeEvent({ id: 'c', startDate: '2026-08-01' }),
    ];
    expect([...events].sort(compareEventsChronological).map((event) => event.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
});

describe('isCommunityEvent', () => {
  it('accepts the served shape, with and without a target', () => {
    expect(isCommunityEvent(makeEvent())).toBe(true);
    expect(isCommunityEvent(makeEvent({ targetKm: 100 }))).toBe(true);
  });

  it.each([
    ['a run', { id: 'run-1', routeName: 'Loop' }],
    ['a missing owner', { ...makeEvent(), owner: undefined }],
    ['an unknown state', makeEvent({ state: 'someday' as CommunityEvent['state'] })],
    ['a missing mine flag', { ...makeEvent(), mine: undefined }],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(isCommunityEvent(value)).toBe(false);
  });
});
