import { useCallback, useEffect, useState } from 'react';
import type { HHMM, ISODate } from '@shared/types';
import { api, downloadBlob } from '../../lib/api';
import type { CampaignDetail, CampaignSchedule } from '../campaigns/types';

export interface OfflineView {
  place: { exact: string; public: string };
  capacity: number | null;
  waitlist: boolean;
  supplies: string;
  attendance: 'qr' | 'roster' | 'none';
}

export function offlineOf(detail: CampaignDetail): OfflineView {
  const s = detail.campaign.settings as Record<string, unknown>;
  const place = (s.place ?? {}) as { exact?: string; public?: string };
  return {
    place: { exact: place.exact ?? '', public: place.public ?? '' },
    capacity: typeof s.capacity === 'number' ? s.capacity : null,
    waitlist: s.waitlist === true,
    supplies: typeof s.supplies === 'string' ? s.supplies : '',
    attendance: s.attendance === 'roster' || s.attendance === 'none' ? s.attendance : 'qr',
  };
}

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fromMin = (m: number): HHMM => {
  const c = Math.max(0, Math.min(23 * 60 + 59, m));
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}` as HHMM;
};

/** 출석 창: 모임 시작 1시간 전 ~ 끝난 뒤 1시간 (모임 날짜 안에서만). */
export function attendanceGate(s: CampaignSchedule, today: ISODate, now: string): { open: boolean; message: string | null } {
  if (!s.eventDate || !s.eventStart || !s.eventEnd) return { open: false, message: '모임 시간이 아직 정해지지 않았어요' };
  const from = toMin(s.eventStart) - 60;
  const to = toMin(s.eventEnd) + 60;
  if (today < s.eventDate || (today === s.eventDate && toMin(now) < from)) return { open: false, message: `출석은 ${fromMin(from)}부터 열려요` };
  if (today > s.eventDate || toMin(now) > to) return { open: false, message: '출석 시간이 지났어요' };
  return { open: true, message: null };
}

export interface Attendance { at: string; method: string }

/** 내 출석 기록. 모임 날부터 불러온다. */
export function useAttendance(participationId: string | undefined, enabled: boolean, refreshKey: string) {
  const [attendance, setAttendance] = useState<Attendance | null | undefined>(undefined);
  const load = useCallback(async () => {
    if (!participationId || !enabled) { setAttendance(null); return; }
    try {
      const r = await api<{ participation: { attendance: Attendance | null } }>(`/api/participations/${participationId}`, { quiet: true });
      setAttendance(r.participation?.attendance ?? null);
    } catch {
      setAttendance(null);
    }
  }, [participationId, enabled]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  return { attendance, reload: load };
}

/** 취소는 모집 마감 시각까지 */
export function canCancelNow(s: CampaignSchedule, today: ISODate, now: string): boolean {
  if (!s.recruitEnd) return true;
  if (today < s.recruitEnd) return true;
  if (today > s.recruitEnd) return false;
  return !s.recruitEndTime || now < s.recruitEndTime;
}

const icsEscape = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (d: string, t: string) => `${d.replace(/-/g, '')}T${t.replace(':', '')}00`;

export function buildIcs(detail: CampaignDetail, today: ISODate): string {
  const c = detail.campaign;
  const s = c.schedule;
  const o = offlineOf(detail);
  const date = s.eventDate!;
  const start = s.eventStart ?? '09:00';
  const end = s.eventEnd ?? start;
  const where = o.place.exact || o.place.public;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//기후시민플랫폼//KO', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${c.id}@climate-citizen-platform`,
    `DTSTAMP:${today.replace(/-/g, '')}T000000Z`,
    `DTSTART;TZID=Asia/Seoul:${icsDate(date, start)}`,
    `DTEND;TZID=Asia/Seoul:${icsDate(date, end)}`,
    `SUMMARY:${icsEscape(c.title)}`,
    ...(where ? [`LOCATION:${icsEscape(where)}`] : []),
    `DESCRIPTION:${icsEscape(`${c.host.name} 주최`)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcs(detail: CampaignDetail, today: ISODate) {
  downloadBlob(new Blob([buildIcs(detail, today)], { type: 'text/calendar;charset=utf-8' }), `${detail.campaign.title}.ics`);
}

export const atTime = (at: string) => (at.length >= 16 ? at.slice(11, 16) : at);
