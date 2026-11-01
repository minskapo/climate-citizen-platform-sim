import { useEffect, useState, type ReactNode } from 'react';
import { dDay, koShort } from '@shared/date';
import { api } from '../../lib/api';
import { copyShareLink } from '../../lib/share';
import { useSim } from '../../lib/sim';
import { Button } from '../../components/ui';
import { BlockSlotView } from '../campaigns/BlockSlotView';
import { CampaignHeader } from '../campaigns/CampaignHeader';
import { HostCard } from '../campaigns/HostCard';
import { InfoCard } from '../campaigns/InfoCard';
import { MaterialsList } from '../campaigns/MaterialsList';
import type { BlockScreen, CampaignDetail } from '../campaigns/types';
import { ExplainerArticle } from './ExplainerArticle';
import { RegionalCounts } from './RegionalCounts';
import './signature.css';

export interface Aggregate { count: number | null; byRegion: Array<{ name: string; n: number }>; other: { regions: number; n: number } }

export const n = (x: number) => x.toLocaleString('ko-KR');
export const md = (d: string) => koShort(d).replace(/\(.\)$/, '');

export interface SigSettings {
  goal: number; countDisplay: 'count_and_rate' | 'count' | 'hidden'; regionalCounts: boolean; demandSummary: string;
  deliveryNotice: boolean; hostJoin: string;
}
export function sigSettings(detail: CampaignDetail): SigSettings {
  const s = detail.campaign.settings;
  return {
    goal: typeof s.goal === 'number' ? s.goal : 0,
    countDisplay: (s.countDisplay as SigSettings['countDisplay']) ?? 'count_and_rate',
    regionalCounts: s.regionalCounts !== false,
    demandSummary: typeof s.demandSummary === 'string' ? s.demandSummary : '',
    deliveryNotice: s.deliveryNotice !== false,
    hostJoin: typeof s.hostJoin === 'string' ? s.hostJoin : 'none',
  };
}

/** 서명 수 · 지역별 서명 수. 서명하거나 취소하면 다시 받는다. */
export function useAggregate(campaignId: string, refreshKey: unknown): Aggregate | null {
  const [agg, setAgg] = useState<Aggregate | null>(null);
  useEffect(() => {
    let alive = true;
    api<Aggregate>(`/api/aggregates/signature/${campaignId}`, { quiet: true }).then((r) => alive && setAgg(r)).catch(() => undefined);
    return () => { alive = false; };
  }, [campaignId, refreshKey]);
  return agg;
}

/** 공개해도 되는 서명 수. 숨김이면 null. */
export function visibleCount(detail: CampaignDetail, agg: Aggregate | null): number | null {
  if (sigSettings(detail).countDisplay === 'hidden') return agg?.count ?? null;
  return agg?.count ?? detail.counts.participants;
}

/** 서명 수 · 목표 · 달성률 막대 */
export function CountBlock({ detail, agg, lead }: { detail: CampaignDetail; agg: Aggregate | null; lead?: ReactNode }) {
  const s = sigSettings(detail);
  const count = visibleCount(detail, agg);
  if (s.countDisplay === 'hidden' && count == null) return <p className="capply-count sig-gather">서명이 모이고 있어요</p>;
  const goal = s.goal > 0 ? s.goal : 0;
  const showRate = s.countDisplay === 'count_and_rate' && goal > 0;
  const c = count ?? 0;
  const pct = showRate ? Math.min(100, Math.round((c / goal) * 100)) : 0;
  return (
    <>
      <p className="capply-count"><strong>{n(c)}</strong>명 서명{showRate ? ` · 목표 ${n(goal)}명` : ''}</p>
      {lead}
      {showRate && (
        <div className="sig-bar" role="progressbar" aria-label="목표 달성률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </>
  );
}

/** 헤더의 초록 상태 줄 */
export function headerLine(detail: CampaignDetail, agg: Aggregate | null, today: string, closed: boolean, delivered: boolean): string {
  const s = sigSettings(detail);
  const sch = detail.campaign.schedule;
  const count = visibleCount(detail, agg);
  const parts: string[] = [];
  if (s.countDisplay === 'hidden' && count == null) parts.push('서명이 모이고 있어요');
  else {
    parts.push(`${n(count ?? 0)}명 서명`);
    if (s.countDisplay === 'count_and_rate' && s.goal > 0) parts.push(closed ? `목표의 ${Math.round(((count ?? 0) / s.goal) * 100)}%` : `목표 ${n(s.goal)}명`);
  }
  if (sch.recruitEnd) parts.push(closed ? `${md(sch.recruitEnd)} 마감` : `서명 마감 ${koShort(sch.recruitEnd)} · ${dDay(today, sch.recruitEnd)}`);
  if (closed && sch.deliveryDate) parts.push(`${md(sch.deliveryDate)} ${delivered ? '전달 완료' : '전달 예정'}`);
  return parts.join(' · ');
}

export function ShareButton({ detail, label = '공유하기', onShared }: { detail: CampaignDetail; label?: string; onShared?(): void }) {
  const sim = useSim();
  const uid = sim.userId && sim.role !== 'guest' ? sim.userId : null;
  return (
    <Button block variant="outline" onClick={() => { void copyShareLink(detail.campaign.id, uid).then((ok) => ok && onShared?.()); }}>{label}</Button>
  );
}

/** S · S-2 · S-3 공통 틀: 머리 · 왼쪽(정보 · 요구안 · 설명 글 · 자료) · 오른쪽(서명 수 · 버튼 · 지역별 서명 수). */
export function SignLayout({ detail, agg, screen, chip, line, lead, side }: {
  detail: CampaignDetail; agg: Aggregate | null; screen: BlockScreen; chip: ReactNode; line: string; lead?: ReactNode; side: ReactNode;
}) {
  const c = detail.campaign;
  const s = sigSettings(detail);
  return (
    <>
      <CampaignHeader detail={detail} statusChip={chip} line={line} />
      <div className="container page cdetail sig-layout">
        <div className="cdetail-main">
          {lead}
          <BlockSlotView campaignId={c.id} screen={screen} slot="top" />
          <InfoCard detail={detail} />
          <BlockSlotView campaignId={c.id} screen={screen} slot="after_common" />
          {s.demandSummary && (
            <section className="card sig-demand" aria-label="요구안">
              <h2 className="csec-title">요구안</h2>
              <p>{s.demandSummary}</p>
            </section>
          )}
          <ExplainerArticle detail={detail} />
          <BlockSlotView campaignId={c.id} screen={screen} slot="bottom" />
          <HostCard host={c.host} />
          <MaterialsList detail={detail} />
        </div>
        <aside className="cdetail-side">
          {side}
          {s.regionalCounts && <RegionalCounts agg={agg} />}
        </aside>
      </div>
    </>
  );
}
