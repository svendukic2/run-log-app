import { act, renderHook, waitFor } from '@testing-library/react';
import { holdNextSearch, seedRunners } from '@/test/usersApiMock';
import { reloadUserSearch, useUserSearch } from './userSearch';

// One test, for the one thing this store exists to get right (RUN-62).
// Everything else about the search is proved through the People page; this
// is the race a component test cannot stage honestly, because two reads of
// the SAME query are exactly the case the hook's own key check cannot
// catch - only the load token can.
describe('useUserSearch', () => {
  it('discards a slow answer that a newer read already replaced', async () => {
    seedRunners([{ firstName: 'Ana' }]);
    // The first read is parked, so its body is the world as it was: one
    // runner.
    const releaseStaleAnswer = holdNextSearch();

    const { result } = renderHook(() => useUserSearch('an'));
    await waitFor(() => expect(result.current.status).toBe('loading'));

    // Somebody else signs up and the query is read again; that answer is
    // the newer, truer one.
    seedRunners([{ firstName: 'Anders' }]);
    act(() => reloadUserSearch('an'));
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    // Now the first read finally lands. Landing last must not make it win.
    await act(async () => {
      releaseStaleAnswer();
    });

    expect(result.current.items).toHaveLength(2);
  });
});
