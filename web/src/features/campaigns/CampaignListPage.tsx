import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { koShort } from '@shared/date';
import type { CampaignStatus, CampaignType } from '@shared/types';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { Button, Chip, EmptyState, Spinner } from '../../components/ui';
import { CollabModal } from '../collab/CollabModal';
import { CampaignCard } from './CampaignCard';
import type { CampaignDetail, CampaignListItem, CampaignMode } from './types';
import './campaigns.css';

type Counts = Record<'all' | CampaignStatus, number>;
const STATUS_TABS: Array<[CampaignStatus | '', string]> = [['', '전체'], ['recruiting', '모집 중'], ['running', '진행 중'], ['scheduled', '모집 예정'], ['closed', '마감']];
const TYPE_CHIPS: Array<[CampaignType | '', string]> = [['', '전체'], ['signature', '서명'], ['practice', '실천'], ['offline', '오프라인 모임']];
const MODES: Array<[CampaignMode | '', string]> = [['', '전체'], ['online', '온라인'], ['offline', '오프라인'], ['hybrid', '온·오프라인']];
const REGIONS = ['전국·온라인', '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const SHOWN = 9;

const md = (d: string) => koShort(d).replace(/\(.\)$/, '');

/** B 캠페인 목록 */
export function CampaignListPage() {
  const sim = useSim();
  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [type, setType] = useState<CampaignType | ''>('');
  const [region, setRegion] = useState('');
  const [mode, setMode] = useState<CampaignMode | ''>('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'deadline' | 'new'>('deadline');
  const [items, setItems] = useState<CampaignListItem[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [shown, setShown] = useState(SHOWN);
  const [failed, setFailed] = useState(false);
  const [hero, setHero] = useState<CampaignDetail | null>(null);
  const [collab, setCollab] = useState(false);

  const params = (cursor: string | null) => {
    const sp = new URLSearchParams();
    if (status) sp.set('status', status);
    if (type) sp.set('type', type);
    if (region) sp.set('region', region);
    if (mode) sp.set('mode', mode);
    if (query) sp.set('q', query);
    if (sort === 'deadline') sp.set('sort', 'deadline');
    if (cursor) sp.set('cursor', cursor);
    return sp.toString();
  };

  useEffect(() => {
    let alive = true;
    setItems(null);
    setShown(SHOWN);
    api<{ items: CampaignListItem[]; nextCursor: string | null; counts: Counts }>(`/api/campaigns?${params(null)}`, { quiet: true })
      .then((r) => { if (!alive) return; setItems(r.items); setNext(r.nextCursor); setCounts(r.counts); setFailed(false); })
      .catch(() => { if (!alive) return; setItems([]); setFailed(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type, region, mode, query, sort, sim.today, sim.userId, sim.role]);

  useEffect(() => {
    let alive = true;
    api<{ campaign: CampaignDetail | null }>('/api/campaigns/hero', { quiet: true })
      .then((r) => alive && setHero(r.campaign)).catch(() => alive && setHero(null));
    return () => { alive = false; };
  }, [sim.today]);

  const total = counts ? (status ? counts[status] : counts.all) : 0;
  const visible = (items ?? []).slice(0, shown);
  const more = async () => {
    const want = shown + SHOWN;
    if (items && items.length < want && next) {
      try {
        const r = await api<{ items: CampaignListItem[]; nextCursor: string | null }>(`/api/campaigns?${params(next)}`, { quiet: true });
        setItems([...items, ...r.items]);
        setNext(r.nextCursor);
      } catch { /* 다음에 다시 */ }
    }
    setShown(want);
  };
  const remaining = Math.max(0, total - visible.length);

  const hc = hero?.campaign;
  return (
    <div className="container page clist">
      <div className="clist-head">
        <div>
          <h1 className="page-title">캠페인</h1>
          <p className="clist-lead">기간을 정해 함께 실천하는 활동이에요. 누구나 참여할 수 있어요.</p>
        </div>
        <Button variant="outline" onClick={() => setCollab(true)}>캠페인 협업 제안</Button>
      </div>

      {hc && (
        <Link to={`/campaigns/${hc.id}`} className="clist-hero">
          <Chip tone="green" className="clist-hero-chip">추천</Chip>
          <span className="clist-hero-text">
            {hc.title} 참가자를 모집하고 있어요. {hc.summary.replace(/[.。]\s*$/, '')}{hc.schedule.recruitEnd ? ` (~${md(hc.schedule.recruitEnd)})` : ''}
          </span>
          <span className="clist-hero-go">{hc.type === 'signature' ? '서명하기' : '참여 신청'} →</span>
        </Link>
      )}

      <div className="clist-tabs" role="tablist" aria-label="캠페인 상태">
        {STATUS_TABS.map(([k, label]) => (
          <button key={k || 'all'} type="button" role="tab" aria-selected={status === k} className={status === k ? 'on' : undefined} onClick={() => setStatus(k)}>
            {label} <small>{counts ? (k ? counts[k] : counts.all) : ''}</small>
          </button>
        ))}
      </div>

      <div className="clist-filters">
        <div className="clist-types" role="group" aria-label="캠페인 유형">
          {TYPE_CHIPS.map(([k, label]) => (
            <button key={k || 'all'} type="button" aria-pressed={type === k} className={`clist-type${type === k ? ' on' : ''}`} onClick={() => setType(k)}>{label}</button>
          ))}
        </div>
        <div className="clist-selects">
          <select className="input" aria-label="지역" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">지역: 전체</option>
            {REGIONS.map((r) => <option key={r} value={r}>지역: {r}</option>)}
          </select>
          <select className="input" aria-label="참여 방식" value={mode} onChange={(e) => setMode(e.target.value as CampaignMode | '')}>
            {MODES.map(([k, label]) => <option key={k || 'all'} value={k}>참여 방식: {label}</option>)}
          </select>
          <form role="search" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
            <input className="input clist-search" type="search" placeholder="⌕ 캠페인 검색" aria-label="캠페인 검색" value={q}
              onChange={(e) => { setQ(e.target.value); if (!e.target.value) setQuery(''); }} />
          </form>
          <select className="input" aria-label="정렬" value={sort} onChange={(e) => setSort(e.target.value as 'deadline' | 'new')}>
            <option value="deadline">마감 임박순</option>
            <option value="new">최근 연 순</option>
          </select>
        </div>
      </div>

      {items === null && <Spinner />}
      {items && items.length === 0 && (
        <EmptyState title={failed ? '캠페인을 불러오지 못했어요' : query || type || status || region || mode ? '조건에 맞는 캠페인이 없어요' : '아직 열린 캠페인이 없어요'}>
          {failed ? '잠시 후 다시 열어 주세요.' : '녹색전환연구소가 캠페인을 열면 여기에 보여요. 함께하고 싶은 캠페인이 있다면 협업을 제안해 주세요.'}
        </EmptyState>
      )}
      {items && items.length > 0 && <div className="ccards">{visible.map((c) => <CampaignCard key={c.id} c={c} />)}</div>}
      {items && remaining > 0 && (
        <div className="clist-more"><Button variant="outline" pill onClick={more}>캠페인 더 보기 ({remaining})</Button></div>
      )}
      {collab && <CollabModal onClose={() => setCollab(false)} />}
    </div>
  );
}
