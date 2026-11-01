import { useCallback, useEffect, useState } from 'react';
import { koShort } from '@shared/date';
import { missionForDate } from '@shared/missions';
import type { ISODate, RecordField } from '@shared/types';
import { api } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';
import { useSim } from '../../lib/sim';
import { showToast } from '../../components/Toast';
import { CHECK_LABEL, type Measurement, type RecordsResponse } from './types';
import type { CampaignDetail } from '../campaigns/types';

/** 참가자 화면이 함께 쓰는 데이터: 내 기록 · 오늘 n명 기록 · 내 측정(출발점 · 마무리). */
export function usePracticeData(detail: CampaignDetail) {
  const sim = useSim();
  const pid = detail.myParticipation?.id ?? null;
  const recording = detail.campaign.settings.recordEnabled !== false;
  const [records, setRecords] = useState<RecordsResponse | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[] | null>(null);

  const load = useCallback(async () => {
    const jobs: Promise<unknown>[] = [];
    if (pid && recording) {
      jobs.push(api<RecordsResponse>(`/api/participations/${pid}/records`, { quiet: true }).then(setRecords).catch(() => setRecords(null)));
      jobs.push(api<{ count: number }>(`/api/campaigns/${detail.campaign.id}/today-count`, { quiet: true }).then((r) => setTodayCount(r.count)).catch(() => setTodayCount(null)));
    }
    if (sim.userId) jobs.push(api<{ items: Measurement[] }>('/api/me/measurements', { quiet: true }).then((r) => setMeasurements(r.items ?? [])).catch(() => setMeasurements([])));
    await Promise.all(jobs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, recording, detail.campaign.id, sim.today, sim.userId]);
  useEffect(() => { void load(); }, [load]);

  const mine = detail.myParticipation;
  const start = measurements?.find((m) => m.id === mine?.startMeasurementId)
    ?? measurements?.find((m) => m.campaignId === detail.campaign.id && m.kind === 'start') ?? null;
  const end = measurements?.find((m) => m.campaignId === detail.campaign.id && m.kind === 'end') ?? null;
  return { records, todayCount, start, end, reload: load };
}

/** 오늘 미션에서 받는 기록 항목 = 캠페인 기록 항목 + 미션별 추가 항목 */
export function fieldsFor(detail: CampaignDetail, date: ISODate): RecordField[] {
  const s = detail.campaign.settings;
  const { runStart, runDays } = detail.campaign.schedule;
  const m = runStart ? missionForDate(detail.missions, s.missionCycle ?? 'daily', runStart, date, runDays ?? undefined) : null;
  return [...new Set<RecordField>([...(s.recordFields ?? ['check']), ...(m?.extraFields ?? [])])];
}

export function downloadMyRecords(detail: CampaignDetail, data: RecordsResponse) {
  const c = detail.campaign;
  const s = c.settings;
  const rec = new Map(data.records.map((r) => [r.slotDate, r]));
  const paused = new Set(data.pausedDates);
  const rows = data.slots.map((d, i) => {
    const m = c.schedule.runStart ? missionForDate(detail.missions, s.missionCycle ?? 'daily', c.schedule.runStart, d, c.schedule.runDays ?? undefined) : null;
    const r = rec.get(d);
    return [d, i + 1, m?.category ?? '', m?.title ?? '', r ? CHECK_LABEL[r.check] : paused.has(d) ? '쉬어 감' : '', r?.memo ?? '', r?.number ?? '', r?.photoFileId ? '있음' : ''];
  });
  downloadCsv(`${c.title.replace(/[\\/:*?"<>|]/g, '')}-내-기록.csv`, ['날짜', '차례', '분류', '미션', '실천', '한 줄 메모', `숫자${s.numberUnit ? `(${s.numberUnit})` : ''}`, '사진'], rows);
  showToast('내 기록을 내려받았어요 (CSV)');
}

export const reminderText = (rem: { enabled?: boolean; time?: string; channel?: string } | undefined, fallbackTime: string, daily: boolean) => {
  if (rem && rem.enabled === false) return '미션 알림이 꺼져 있어요';
  const t = rem?.time ?? fallbackTime;
  return `${rem?.channel === 'email' ? '이메일' : '앱 푸시'} · ${daily ? '매일' : '기록할 날'} ${timeText(t)}`;
};

export function timeText(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const part = h >= 18 ? '저녁' : h >= 12 ? '오후' : h >= 5 ? '아침' : '새벽';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${part} ${h12}시${m ? ` ${m}분` : ''}`;
}

export const mdOf = (d: string) => koShort(d).replace(/\(.\)$/, '');
