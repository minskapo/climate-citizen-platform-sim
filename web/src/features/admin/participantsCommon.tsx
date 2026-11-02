import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Chip } from '../../components/ui';
import { api } from '../../lib/api';
import { STATUS_LABEL, STATUS_TONE, type CampaignDetail } from '../campaigns/types';

export interface Part {
  id: string; userId: string; nickname: string; region: string; sigungu: string; state: string; appliedOn: string; companions: number;
  startTotal: number | null; endTotal: number | null; recordCount: number; reminderOn: boolean; checklistDone: number; research: boolean;
  sharedCount: number; hostJoin: 'joined' | 'pending' | 'none'; attendance: { at: string; method: string } | null; photo: boolean;
}
export interface PartCounts {
  all: number; noStart: number; reminderOff: number; noRecord: number; waitlisted: number; cancelled: number;
  withStart: number; avgStart: number | null; checklistComplete: number; research: number;
}
export interface PartData { items: Part[]; counts: PartCounts }

export const n = (v: number) => v.toLocaleString('ko-KR');
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const regionText = (p: Pick<Part, 'region' | 'sigungu'>) => [p.region, p.sigungu].filter(Boolean).join(' ');

/** 캠페인 한 건 + 참가자 목록. filter는 서버 필터(cancelled 등). */
export function useParticipants(id: string | undefined, filter = '') {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [data, setData] = useState<PartData | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const [c, d] = await Promise.all([
        api<CampaignDetail>(`/api/campaigns/${id}`, { quiet: true }),
        api<PartData>(`/api/admin/campaigns/${id}/participants${filter ? `?filter=${filter}` : ''}`, { quiet: true }),
      ]);
      setCampaign(c); setData(d); setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [id, filter]);
  useEffect(() => { void reload(); }, [reload]);
  return { campaign, data, failed, reload };
}

export function StatCards({ cards }: { cards: Array<{ label: string; value: string; note: ReactNode }> }) {
  return (
    <div className="adm-stats adm-stats-4" role="list">
      {cards.map((c) => (
        <div key={c.label} className="adm-stat" role="listitem">
          <span>{c.label}</span>
          <b>{c.value}</b>
          <small className="adm-stat-note">{c.note}</small>
        </div>
      ))}
    </div>
  );
}

export function PartHead({ campaign, titleSuffix, sub, actions }: { campaign: CampaignDetail; titleSuffix: string; sub: ReactNode; actions: ReactNode }) {
  const c = campaign.campaign;
  return (
    <div className="adm-head">
      <div>
        <h1 className="adm-title">{c.title} · {titleSuffix} <Chip tone={STATUS_TONE[campaign.status]} square>{STATUS_LABEL[campaign.status]}</Chip></h1>
        <p className="adm-lead">{sub}</p>
      </div>
      <div className="adm-head-actions">
        {actions}
        <Link to={`/admin/campaigns/${c.id}/edit`} className="btn btn-primary btn-md btn-pill">캠페인 설정</Link>
      </div>
    </div>
  );
}

export function FilterTabs<T extends string>({ tabs, value, onChange }: { tabs: Array<[T, string]>; value: T; onChange(v: T): void }) {
  return (
    <div className="adm-tabs" role="tablist" aria-label="보기">
      {tabs.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={`adm-tab${value === k ? ' is-on' : ''}`} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}
