import { describe, expect, test } from 'vitest';
import { dueNotifications, type DueInput } from '@shared/notificationsDue';
import { recordSlots } from '@shared/missions';

const slots = recordSlots('daily', '2027-02-08', 28);
const base = (over: Partial<DueInput> & { recorded?: string[]; paused?: string[] }): DueInput => ({
  today: '2027-02-20', nowTime: '20:00', reminderTime: '20:00',
  participations: [{ campaignId: 'c1', title: '탄소 다이어트', slots, recorded: over.recorded ?? [], paused: over.paused ?? [] }],
  offline: [],
  ...over,
});
const yesterdayUpTo = (n: number) => Array.from({ length: n }, (_, i) => `2027-02-${String(19 - i).padStart(2, '0')}`);

describe('dueNotifications', () => {
  test('reminder only after reminderTime and only if unrecorded', () => {
    const recorded = ['2027-02-19'];
    expect(dueNotifications(base({ nowTime: '19:59', recorded }))).toEqual([]);
    const r = dueNotifications(base({ nowTime: '20:00', recorded }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'mission_reminder', campaignId: 'c1', text: '오늘 기록할 차례예요 · 탄소 다이어트' });
    expect(dueNotifications(base({ recorded: ['2027-02-19', '2027-02-20'] }))).toEqual([]);
  });
  test('missed_1 and missed_2 copy', () => {
    // recorded 2/18 and earlier, missed 2/19 => missed 1
    const r1 = dueNotifications(base({ recorded: ['2027-02-18'] }));
    expect(r1[0].kind).toBe('missed_1');
    expect(r1[0].text).toContain('어제 못 했어도 괜찮아요');
    const r2 = dueNotifications(base({ recorded: ['2027-02-17'] }));
    expect(r2[0].kind).toBe('missed_2');
    expect(r2[0].text).toContain('사흘째가 되기 전에, 오늘 미션은 1분이면 돼요');
  });
  test('missed_3 fires once per day', () => {
    const a = dueNotifications(base({ recorded: ['2027-02-16'] }));
    const b = dueNotifications(base({ recorded: ['2027-02-16'], nowTime: '22:00' }));
    expect(a[0].kind).toBe('missed_3');
    expect(a[0].dedupeKey).toBe(b[0].dedupeKey);
    expect(a[0].dedupeKey).toBe('missed_3:c1:2027-02-20');
    expect(a[0].text).toContain('다시 시작');
  });
  test('paused today or on a non-slot day sends nothing; paused past slots are not missed', () => {
    expect(dueNotifications(base({ paused: ['2027-02-20'] }))).toEqual([]);
    const weekly = recordSlots('weekly', '2027-02-08', 28);
    const input = base({});
    input.participations = [{ campaignId: 'c1', title: 't', slots: weekly, recorded: [], paused: [] }];
    expect(dueNotifications(input)).toEqual([]); // 2/20 is not a weekly slot
    const rest = base({ recorded: ['2027-02-12'], paused: ['2027-02-13', '2027-02-14', '2027-02-15', '2027-02-16', '2027-02-17', '2027-02-18', '2027-02-19'] });
    expect(dueNotifications(rest)[0].kind).toBe('mission_reminder');
  });
  test('offline notifications', () => {
    const off = [{ campaignId: 'o1', title: '플로깅', eventDate: '2027-01-25', eventStart: '14:00' }];
    const mk = (today: string, nowTime: string): DueInput => ({ today, nowTime, reminderTime: '20:00', participations: [], offline: off });
    expect(dueNotifications(mk('2027-01-24', '17:59'))).toEqual([]);
    expect(dueNotifications(mk('2027-01-24', '18:00')).map((d) => d.kind)).toEqual(['offline_day_before']);
    expect(dueNotifications(mk('2027-01-25', '11:59'))).toEqual([]);
    const r = dueNotifications(mk('2027-01-25', '12:00'));
    expect(r.map((d) => d.kind)).toEqual(['offline_2h']);
    expect(r[0].dedupeKey).toBe('offline_2h:o1:2027-01-25');
  });
});
