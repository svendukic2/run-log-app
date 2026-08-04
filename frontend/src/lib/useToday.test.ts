import { act, renderHook } from '@testing-library/react';
import { useToday } from './useToday';

describe('useToday', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns today as an ISO date', () => {
    const { result } = renderHook(() => useToday());
    expect(result.current).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('refreshes across midnight when the user returns to the tab', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 3, 23, 55));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe('2026-08-03');

    // Midnight passes while the tab sits in the background...
    jest.setSystemTime(new Date(2026, 7, 4, 0, 5));
    // ...and coming back must not keep reporting yesterday's week.
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe('2026-08-04');
  });

  it('also refreshes on visibilitychange', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 3, 23, 55));
    const { result } = renderHook(() => useToday());

    jest.setSystemTime(new Date(2026, 7, 4, 8, 0));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('2026-08-04');
  });

  it('removes both listeners on unmount', () => {
    const removeWindow = jest.spyOn(window, 'removeEventListener');
    const removeDocument = jest.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => useToday());
    unmount();

    expect(removeWindow).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeWindow.mockRestore();
    removeDocument.mockRestore();
  });
});
