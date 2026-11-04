import { describe, expect, test, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SIM_BASE_DATE } from '@shared/date';
import { __reloadSimForTest, useSim, SIM_KEY } from './sim';

beforeEach(() => {
  localStorage.clear();
  __reloadSimForTest();
});

describe('useSim', () => {
  test('today follows fixedDate then offset', () => {
    const { result } = renderHook(() => useSim());
    act(() => result.current.setDate('2027-02-08'));
    expect(result.current.today).toBe('2027-02-08');
    act(() => result.current.shiftDays(12));
    expect(result.current.today).toBe('2027-02-20');
    act(() => result.current.shiftDays(-1));
    expect(result.current.today).toBe('2027-02-19');
    // picking a date again resets the offset
    act(() => result.current.setDate('2027-03-01'));
    expect(result.current.today).toBe('2027-03-01');
    expect(result.current.dateOffsetDays).toBe(0);
  });

  test('defaults to the base date; 기준일로 returns to it', () => {
    const { result } = renderHook(() => useSim());
    expect(result.current.today).toBe(SIM_BASE_DATE);
    const real = SIM_BASE_DATE;
    act(() => result.current.setDate('2027-02-08'));
    act(() => result.current.shiftDays(7));
    act(() => result.current.setDate(null));
    expect(result.current.today).toBe(real);
    expect(result.current.fixedDate).toBeNull();
    expect(result.current.dateOffsetDays).toBe(0);
  });

  test('role persists per browser', () => {
    const { result, unmount } = renderHook(() => useSim());
    act(() => result.current.setUser('u1', '초록이'));
    act(() => result.current.setRole('admin'));
    unmount();
    expect(JSON.parse(localStorage.getItem(SIM_KEY)!).role).toBe('admin');
    __reloadSimForTest();
    const again = renderHook(() => useSim());
    expect(again.result.current.role).toBe('admin');
    expect(again.result.current.nickname).toBe('초록이');
  });

  test('time override wins over the clock', () => {
    const { result } = renderHook(() => useSim());
    act(() => result.current.setTime('14:05'));
    expect(result.current.nowTime).toBe('14:05');
    act(() => result.current.setTime(null));
    expect(result.current.nowTime).toMatch(/^\d{2}:\d{2}$/);
  });

  test('signOut drops the user and returns to guest but keeps the token', () => {
    const { result } = renderHook(() => useSim());
    act(() => result.current.setToken('t'));
    act(() => result.current.setUser('u1', '초록이'));
    act(() => result.current.setRole('member'));
    act(() => result.current.signOut());
    expect(result.current.userId).toBeNull();
    expect(result.current.role).toBe('guest');
    expect(result.current.token).toBe('t');
  });

  test('broken storage falls back to defaults', () => {
    localStorage.setItem(SIM_KEY, '{nope');
    __reloadSimForTest();
    const { result } = renderHook(() => useSim());
    expect(result.current.role).toBe('guest');
    expect(result.current.token).toBeNull();
  });
});
