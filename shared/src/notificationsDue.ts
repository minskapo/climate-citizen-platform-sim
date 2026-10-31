import type { HHMM, ISODate } from './types';
import { addDays, koShort } from './date';
import { missedStreak } from './missions';

export type DueKind =
  | 'mission_reminder' | 'missed_1' | 'missed_2' | 'missed_3'
  | 'offline_day_before' | 'offline_2h' | 'collab_due';

export interface DueInput {
  today: ISODate;
  nowTime: HHMM;
  reminderTime: HHMM;
  participations: Array<{ campaignId: string; title: string; slots: ISODate[]; recorded: ISODate[]; paused: ISODate[] }>;
  offline: Array<{ campaignId: string; title: string; eventDate: ISODate; eventStart: HHMM }>;
}

export interface Due { kind: DueKind; campaignId: string; dedupeKey: string; text: string }

const OFFLINE_DAY_BEFORE_TIME: HHMM = '18:00';

function minusHours(t: HHMM, h: number): HHMM {
  const [hh, mm] = t.split(':').map(Number);
  const total = Math.max(0, hh * 60 + mm - h * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function dueNotifications(input: DueInput): Due[] {
  const { today, nowTime, reminderTime } = input;
  const out: Due[] = [];
  const push = (kind: DueKind, campaignId: string, text: string) =>
    out.push({ kind, campaignId, dedupeKey: `${kind}:${campaignId}:${today}`, text });

  for (const p of input.participations) {
    if (nowTime < reminderTime) continue;
    if (!p.slots.includes(today)) continue; // alerts go out on record turns only
    if (p.recorded.includes(today) || p.paused.includes(today)) continue;
    const missed = missedStreak(p.slots, p.recorded, p.paused, today);
    const base = `오늘 기록할 차례예요 · ${p.title}`;
    if (missed === 0) push('mission_reminder', p.campaignId, base);
    else if (missed === 1) push('missed_1', p.campaignId, `${base} · 어제 못 했어도 괜찮아요`);
    else if (missed === 2) push('missed_2', p.campaignId, `사흘째가 되기 전에, 오늘 미션은 1분이면 돼요 · ${p.title}`);
    else if (missed < 5 || missed % 2 === 1) {
      // 5+ missed turns: reduced to every other turn
      push('missed_3', p.campaignId, `다시 시작해 볼까요? 지난 기록은 2일 전까지 채울 수 있어요 · ${p.title}`);
    }
  }

  for (const o of input.offline) {
    if (today === addDays(o.eventDate, -1) && nowTime >= OFFLINE_DAY_BEFORE_TIME) {
      push('offline_day_before', o.campaignId, `내일 모임이 있어요 · ${o.title} · ${koShort(o.eventDate)} ${o.eventStart}`);
    }
    if (today === o.eventDate && nowTime >= minusHours(o.eventStart, 2)) {
      push('offline_2h', o.campaignId, `곧 모임이 시작돼요 · ${o.title} · ${o.eventStart}`);
    }
  }
  return out;
}
