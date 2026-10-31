import { describe, expect, test } from 'vitest';
import {
  recordSlots, missionForDate, missionLabel, roundLabel, progress, missedStreak, backfillableSlots, nextSlot, type Mission,
} from '@shared/missions';

const mk = (round: number | null, date: string | null = null): Mission =>
  ({ id: `m${round ?? date}`, round, date, category: 'c', title: `t${round ?? date}`, extraFields: [] });
const m4 = [1, 2, 3, 4].map((r) => mk(r));
const range = (start: number, n: number) =>
  Array.from({ length: n }, (_, i) => `2027-02-${String(start + i).padStart(2, '0')}`);

describe('recordSlots', () => {
  test('weekly slots for 28 days', () =>
    expect(recordSlots('weekly', '2027-02-08', 28)).toEqual(['2027-02-14', '2027-02-21', '2027-02-28', '2027-03-07']));
  test('weekly includes last day when not multiple of 7', () =>
    expect(recordSlots('weekly', '2027-02-08', 10)).toEqual(['2027-02-14', '2027-02-17']));
  test('thrice_weekly is 1st/3rd/5th of each 7-day block', () =>
    expect(recordSlots('thrice_weekly', '2027-02-08', 14)).toEqual([
      '2027-02-08', '2027-02-10', '2027-02-12', '2027-02-15', '2027-02-17', '2027-02-19',
    ]));
  test('once_end and daily', () => {
    expect(recordSlots('once_end', '2027-02-08', 28)).toEqual(['2027-03-07']);
    expect(recordSlots('daily', '2027-02-08', 28)).toHaveLength(28);
  });
});

describe('missions', () => {
  test('daily progress', () => {
    const dates12 = range(8, 12); // 2/8 .. 2/19
    expect(progress(recordSlots('daily', '2027-02-08', 28), dates12, '2027-02-20'))
      .toMatchObject({ done: 12, total: 28, dueSoFar: 13, streak: 0 });
    expect(progress(recordSlots('daily', '2027-02-08', 28), dates12, '2027-02-19'))
      .toMatchObject({ done: 12, dueSoFar: 12, streak: 12 });
  });
  test('weekly mission label & round', () => {
    expect(missionLabel('weekly')).toBe('이번 주 미션');
    expect(missionLabel('daily')).toBe('오늘의 미션');
    expect(missionLabel('whole')).toBe('이번 미션');
    expect(missionLabel('dated')).toBe('오늘의 미션');
    expect(missionForDate(m4, 'weekly', '2027-02-08', '2027-02-20')?.round).toBe(2);
    expect(roundLabel('weekly', 2)).toBe('2주차');
    expect(roundLabel('daily', 13)).toBe('13일째');
    expect(roundLabel('whole', 1)).toBe('');
  });
  test('missionForDate by cycle and window', () => {
    const d = Array.from({ length: 28 }, (_, i) => mk(i + 1));
    expect(missionForDate(d, 'daily', '2027-02-08', '2027-02-20')?.round).toBe(13);
    expect(missionForDate(d, 'daily', '2027-02-08', '2027-02-07')).toBeNull();
    expect(missionForDate(d, 'daily', '2027-02-08', '2027-03-08', 28)).toBeNull();
    expect(missionForDate([mk(1)], 'whole', '2027-02-08', '2027-02-15')?.round).toBe(1);
    const dated = [mk(null, '2027-02-10')];
    expect(missionForDate(dated, 'dated', '2027-02-08', '2027-02-10')).not.toBeNull();
    expect(missionForDate(dated, 'dated', '2027-02-08', '2027-02-11')).toBeNull();
  });
  const slots = recordSlots('thrice_weekly', '2027-02-08', 14); // 8,10,12,15,17,19
  test('missed streak counts slots not days', () => {
    // 2/10, 2/12, 2/15 missed over 6 calendar days -> 3 slots
    expect(missedStreak(slots, ['2027-02-08'], [], '2027-02-16')).toBe(3);
    expect(missedStreak(slots, ['2027-02-08'], [], '2027-02-13')).toBe(2);
  });
  test('paused slots do not count as missed', () => {
    expect(missedStreak(slots, ['2027-02-08'], ['2027-02-10', '2027-02-12'], '2027-02-16')).toBe(1);
  });
  test('backfill only last 2 slots', () => {
    expect(backfillableSlots(slots, [], '2027-02-17')).toEqual(['2027-02-12', '2027-02-15']);
    expect(backfillableSlots(slots, ['2027-02-15'], '2027-02-17')).toEqual(['2027-02-12']);
  });
  test('nextSlot', () => {
    expect(nextSlot(slots, '2027-02-11')).toBe('2027-02-12');
    expect(nextSlot(slots, '2027-02-20')).toBeNull();
  });
});
