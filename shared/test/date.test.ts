import { describe, expect, test } from 'vitest';
import { addDays, diffDays, koShort, koLong, koRange, dDay, todayReal } from '@shared/date';

describe('date', () => {
  test('koShort', () => expect(koShort('2027-02-08')).toBe('2. 8.(월)'));
  test('koLong', () => expect(koLong('2027-02-08')).toBe('2027. 2. 8.(월)'));
  test('koRange same year', () => expect(koRange('2027-02-08', '2027-03-07')).toBe('2. 8.–3. 7.'));
  test('koRange different year', () =>
    expect(koRange('2026-12-28', '2027-01-03')).toBe('2026. 12. 28.–2027. 1. 3.'));
  test('dDay', () => {
    expect(dDay('2027-01-19', '2027-01-31')).toBe('D-12');
    expect(dDay('2027-01-31', '2027-01-31')).toBe('D-day');
    expect(dDay('2027-02-02', '2027-01-31')).toBe('D+2');
  });
  test('addDays across month', () => expect(addDays('2027-02-27', 3)).toBe('2027-03-02'));
  test('addDays negative', () => expect(addDays('2027-03-01', -1)).toBe('2027-02-28'));
  test('diffDays', () => expect(diffDays('2027-02-08', '2027-03-07')).toBe(27));
  test('todayReal format', () => expect(todayReal()).toMatch(/^\d{4}-\d{2}-\d{2}$/));
});
