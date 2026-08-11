import {
  dedupeEventsById,
  formatEventWindow,
  groupEventsByState,
  isCommunityEvent,
  toEventDraft,
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
  it('accepts the required fields alone and with the optional ones', () => {
    expect(validateEventForm(makeForm())).toEqual({});
    expect(validateEventForm(makeForm({ description: 'Run together', targetKm: '100' }))).toEqual(
      {},
    );
  });

  it.each([
    ['a blank name', { name: '   ' }, 'name'],
    ['an over-long name', { name: 'x'.repeat(121) }, 'name'],
    ['a missing start date', { startDate: '' }, 'startDate'],
    ['an end date before the start', { endDate: '2026-08-01' }, 'endDate'],
    ['a non-positive target', { targetKm: '0' }, 'targetKm'],
  ])('rejects %s', (_label, patch, field) => {
    expect(validateEventForm(makeForm(patch))[field as keyof EventFormValues]).toBeDefined();
  });

  it('reports every problem at once', () => {
    const errors = validateEventForm(
      makeForm({ name: '', startDate: '2026-08-16', endDate: '2026-08-10', targetKm: '0' }),
    );
    expect(Object.keys(errors).sort()).toEqual(['endDate', 'name', 'targetKm']);
  });
});

describe('toEventDraft', () => {
  it('trims text and omits a blank target (the API rejects null)', () => {
    const draft = toEventDraft(makeForm({ name: '  Summer 100k  ', description: ' hi ' }));

    expect(draft).toEqual({
      name: 'Summer 100k',
      description: 'hi',
      startDate: '2026-08-10',
      endDate: '2026-08-16',
    });
    expect(toEventDraft(makeForm({ targetKm: '42,5' })).targetKm).toBe(42.5);
  });
});

describe('formatEventWindow', () => {
  it.each([
    ['2026-08-11', '2026-08-11', 'Aug 11, 2026'],
    ['2026-08-10', '2026-08-16', 'Aug 10 – Aug 16, 2026'],
    ['2026-12-28', '2027-01-03', 'Dec 28, 2026 – Jan 3, 2027'],
  ])('renders %s to %s', (start, end, expected) => {
    expect(formatEventWindow(start, end)).toBe(expected);
  });
});

describe('groupEventsByState (AC1)', () => {
  it('buckets every event exactly once, keeping order inside a bucket', () => {
    const groups = groupEventsByState([
      makeEvent({ id: 'a', state: 'finished' }),
      makeEvent({ id: 'b', state: 'active' }),
      makeEvent({ id: 'c', state: 'upcoming' }),
      makeEvent({ id: 'd', state: 'active' }),
    ]);

    expect(groups.active.map((event) => event.id)).toEqual(['b', 'd']);
    expect(groups.upcoming.map((event) => event.id)).toEqual(['c']);
    expect(groups.finished.map((event) => event.id)).toEqual(['a']);
  });
});

describe('dedupeEventsById', () => {
  // The paginated walk can deliver one row twice when a concurrent insert
  // shifts a page boundary; the duplicate would reach React as a dupe key.
  it('collapses duplicate ids, keeping the later occurrence', () => {
    const deduped = dedupeEventsById([
      makeEvent({ id: 'a', participantCount: 1 }),
      makeEvent({ id: 'b' }),
      makeEvent({ id: 'a', participantCount: 2 }),
    ]);

    expect(deduped).toHaveLength(2);
    expect(deduped.find((event) => event.id === 'a')?.participantCount).toBe(2);
  });
});

describe('isCommunityEvent', () => {
  it('accepts the served shape and rejects anything else', () => {
    expect(isCommunityEvent(makeEvent({ targetKm: 100 }))).toBe(true);
    expect(isCommunityEvent({ id: 'run-1', routeName: 'Loop' })).toBe(false);
    expect(isCommunityEvent(makeEvent({ state: 'someday' as CommunityEvent['state'] }))).toBe(
      false,
    );
  });
});
