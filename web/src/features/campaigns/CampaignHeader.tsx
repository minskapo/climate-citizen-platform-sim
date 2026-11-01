import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Chip } from '../../components/ui';
import { useFileUrl } from '../../components/useFileUrl';
import { MODE_LABEL, periodLabel, TYPE_LABEL, TYPE_TONE, type CampaignDetail } from './types';

export type ParticipantTab = 'today' | 'records' | 'board' | 'info';
export const PARTICIPANT_TABS: Array<[ParticipantTab, string]> = [['today', '오늘'], ['records', '내 기록'], ['board', '참가자 게시판'], ['info', '캠페인 안내']];

export function useParticipantTab(): [ParticipantTab, (t: ParticipantTab) => void] {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab = (PARTICIPANT_TABS.some(([k]) => k === raw) ? raw : 'today') as ParticipantTab;
  return [tab, (t) => {
    const next = new URLSearchParams(sp);
    if (t === 'today') next.delete('tab'); else next.set('tab', t);
    setSp(next, { replace: false });
  }];
}

/**
 * 캠페인 머리(태그 · 이름 · 주최 · 소개).
 * - 큰 머리(상세): 대표 이미지 · 소개 · 상태 줄
 * - 작은 머리(참가자 화면): 작은 이미지 · 한 줄 정보 · 탭(오늘 · 내 기록 · 참가자 게시판 · 캠페인 안내)
 */
export function CampaignHeader({ detail, statusChip, meta, line, tabs, tabItems = PARTICIPANT_TABS }: {
  detail: CampaignDetail;
  /** 맨 앞 상태 칩(모집 중 · 참여 중 · 완주 …) */
  statusChip: ReactNode;
  /** 작은 머리의 한 줄 정보. 있으면 작은 머리로 그린다. */
  meta?: string;
  /** 큰 머리의 초록 상태 줄 (예: 312명 참여 · 모집 마감 1. 31.(일) · D-12) */
  line?: ReactNode;
  tabs?: boolean;
  /** 탭 이름을 바꿔 쓸 때(오프라인: 모임 안내 · 참가자 게시판 · 캠페인 안내) */
  tabItems?: Array<[ParticipantTab, string]>;
}) {
  const c = detail.campaign;
  const img = useFileUrl(c.imageFileId);
  const [tab, setTab] = useParticipantTab();
  const tags = (
    <div className="chead-tags">
      {statusChip}
      <Chip tone={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type]}</Chip>
      {periodLabel(c) && <Chip tone="gray">{periodLabel(c)}</Chip>}
      <Chip tone="gray">{MODE_LABEL[c.settings.mode] ?? ''}</Chip>
    </div>
  );
  const crumbs = <nav className="crumbs" aria-label="현재 위치"><Link to="/campaigns">캠페인</Link> › <span>{c.title}</span></nav>;

  if (meta !== undefined) {
    return (
      <div className="chead chead-sm">
        <div className="container">
          {crumbs}
          <div className="chead-row">
            <div className="chead-img chead-img-sm" aria-hidden="true">{img.url ? <img src={img.url} alt="" /> : null}</div>
            <div>
              {tags}
              <h1 className="chead-title">{c.title}</h1>
              <p className="chead-meta">{meta}</p>
            </div>
          </div>
          {tabs && (
            <div className="ctabs" role="tablist" aria-label="캠페인 화면">
              {tabItems.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : undefined} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="chead">
      <div className="container">
        {crumbs}
        <div className="chead-hero">
          <div className="chead-img" aria-hidden={!img.url}>{img.url ? <img src={img.url} alt={`${c.title} 대표 이미지`} /> : null}</div>
          <div className="chead-main">
            {tags}
            <h1 className="chead-title chead-title-lg">{c.title}</h1>
            <p className="chead-host">{c.host.name} 주최</p>
            {c.summary && <p className="chead-summary">{c.summary}</p>}
            {line && <p className="chead-line">{line}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
