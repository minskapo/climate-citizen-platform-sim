import { addDays, koShort } from '@shared/date';
import { missionForDate } from '@shared/missions';
import type { ISODate } from '@shared/types';
import { runLength, type CampaignDetail } from '../campaigns/types';
import type { RecordsResponse } from './types';

type CellState = 'done' | 'partial' | 'missed' | 'paused' | 'left' | 'off';
const STATE_LABEL: Record<CellState, string> = { done: '했어요', partial: '조금 했어요', missed: '못 했어요', paused: '쉬어 감', left: '남은 날', off: '기록 없는 날' };

export const unitOf = (detail: CampaignDetail) => (detail.campaign.settings.recordCycle === 'daily' ? '일' : '번');

/** 기록 달력: 주차(7일) 줄 · 분류 표시 · 했어요/못 했어요/남은 날. */
export function RecordCalendar({ detail, data, today }: { detail: CampaignDetail; data: RecordsResponse; today: ISODate }) {
  const c = detail.campaign;
  const { runStart, runDays } = c.schedule;
  if (!runStart || !runDays) return null;
  const s = c.settings;
  const slots = new Set(data.slots);
  const paused = new Set(data.pausedDates);
  const rec = new Map(data.records.map((r) => [r.slotDate, r]));
  const unit = unitOf(detail);
  const weeks = Math.ceil(runDays / 7);

  const stateOf = (d: ISODate): CellState => {
    const r = rec.get(d);
    if (r) return r.check === 'done' ? 'done' : r.check === 'partial' ? 'partial' : 'missed';
    if (!slots.has(d)) return 'off';
    if (paused.has(d)) return 'paused';
    return d < today ? 'missed' : 'left';
  };
  const label = (w: number) => {
    const m = missionForDate(detail.missions, s.missionCycle ?? 'daily', runStart, addDays(runStart, w * 7), runDays);
    return m?.category ? `${w + 1}주차 · ${m.category}` : `${w + 1}주차`;
  };
  const anyPaused = data.pausedDates.length > 0;
  const { done, dueSoFar, streak } = data.progress;

  return (
    <section className="card rcal" aria-label={`${runLength(runDays)} 기록`}>
      <div className="rcal-head">
        <h2>{runLength(runDays)} 기록</h2>
        <span className="rcal-sum">{done} / {dueSoFar}{unit} 기록{streak >= 2 ? ` · ${streak}${unit} 연속` : ''}</span>
      </div>
      <div className="rcal-grid">
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} className="rcal-row">
            <span className="rcal-label">{label(w)}</span>
            <div className="rcal-cells">
              {Array.from({ length: 7 }, (_, i) => {
                const n = w * 7 + i + 1;
                if (n > runDays) return <span key={i} className="rcal-cell rcal-none" aria-hidden="true" />;
                const d = addDays(runStart, n - 1);
                const st = stateOf(d);
                return (
                  <span key={i} className={`rcal-cell rcal-${st}${d === today ? ' rcal-today' : ''}`} title={`${koShort(d)} · ${STATE_LABEL[st]}`} aria-label={`${n}일째 ${STATE_LABEL[st]}`}>
                    {n}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="rcal-legend">
        <span><i className="rcal-dot rcal-done" />했어요</span>
        <span><i className="rcal-dot rcal-missed" />못 했어요</span>
        {anyPaused && <span><i className="rcal-dot rcal-paused" />쉬어 감</span>}
        <span><i className="rcal-dot rcal-left" />남은 날</span>
      </p>
    </section>
  );
}
