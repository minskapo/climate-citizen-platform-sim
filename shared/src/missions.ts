import type { HHMM, ISODate, MissionCycle, RecordCycle, RecordField } from './types';
import { addDays, diffDays } from './date';

export interface Mission {
  id: string;
  round: number | null;
  date: ISODate | null;
  category: string;
  title: string;
  description?: string;
  extraFields: RecordField[];
}

/** Record turns ("기록할 차례") within the run. */
export function recordSlots(cycle: RecordCycle, runStart: ISODate, runDays: number): ISODate[] {
  const offsets: number[] = [];
  const last = runDays - 1;
  if (cycle === 'daily') {
    for (let i = 0; i < runDays; i++) offsets.push(i);
  } else if (cycle === 'thrice_weekly') {
    for (let b = 0; b * 7 < runDays; b++) for (const k of [0, 2, 4]) if (b * 7 + k < runDays) offsets.push(b * 7 + k);
  } else if (cycle === 'weekly') {
    for (let b = 0; b * 7 < runDays; b++) offsets.push(Math.min(b * 7 + 6, last));
  } else if (runDays > 0) {
    offsets.push(last);
  }
  return offsets.map((o) => addDays(runStart, o));
}

export function missionForDate(
  missions: Mission[], cycle: MissionCycle, runStart: ISODate, date: ISODate, runDays?: number,
): Mission | null {
  if (cycle === 'dated') return missions.find((m) => m.date === date) ?? null;
  const idx = diffDays(runStart, date);
  if (idx < 0) return null;
  if (runDays !== undefined && idx >= runDays) return null;
  if (cycle === 'whole') return missions[0] ?? null;
  const round = cycle === 'daily' ? idx + 1 : Math.floor(idx / 7) + 1;
  return missions.find((m) => m.round === round) ?? null;
}

export function missionLabel(cycle: MissionCycle): '오늘의 미션' | '이번 주 미션' | '이번 미션' | '오늘의 미션' {
  if (cycle === 'weekly') return '이번 주 미션';
  if (cycle === 'whole') return '이번 미션';
  return '오늘의 미션';
}

export function roundLabel(cycle: MissionCycle, round: number): string {
  if (cycle === 'weekly') return `${round}주차`;
  if (cycle === 'daily') return `${round}일째`;
  return '';
}

export function progress(slots: ISODate[], recordedDates: ISODate[], today: ISODate) {
  const rec = new Set(recordedDates);
  const due = slots.filter((s) => s <= today);
  // Consecutive recorded slots ending at the latest slot before today; today's own slot
  // extends the streak when recorded but never breaks it while still open.
  let streak = 0;
  let i = due.length - 1;
  if (i >= 0 && due[i] === today) {
    if (rec.has(today)) streak++;
    i--;
  }
  for (; i >= 0 && rec.has(due[i]); i--) streak++;
  return {
    done: slots.filter((s) => rec.has(s)).length,
    total: slots.length,
    dueSoFar: due.length,
    streak,
  };
}

/** Consecutive missed slots before today, most recent first. Paused slots are skipped (neither missed nor a break). */
export function missedStreak(
  slots: ISODate[], recordedDates: ISODate[], pausedDates: ISODate[], today: ISODate,
): number {
  const rec = new Set(recordedDates);
  const paused = new Set(pausedDates);
  let n = 0;
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i];
    if (s >= today || paused.has(s)) continue;
    if (rec.has(s)) break;
    n++;
  }
  return n;
}

/** Unrecorded slots among the 2 most recent slots before today. */
export function backfillableSlots(slots: ISODate[], recordedDates: ISODate[], today: ISODate): ISODate[] {
  const rec = new Set(recordedDates);
  return slots.filter((s) => s < today).slice(-2).filter((s) => !rec.has(s));
}

/** First slot on or after today (today's own turn counts). */
export function nextSlot(slots: ISODate[], today: ISODate): ISODate | null {
  return slots.find((s) => s >= today) ?? null;
}

export type { HHMM };
