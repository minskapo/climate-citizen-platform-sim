import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CampaignStatus } from '@shared/types';
import { ButtonLink, Chip, EmptyState, LoadError, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { periodLabel, STATUS_LABEL, STATUS_TONE, TYPE_LABEL, type CampaignListItem } from '../campaigns/types';
import { useAdminCrumbs } from './AdminLayout';
import { md } from './editor/model';
import { CloneModal } from './modals/Clone';
import { DeliveryModal } from './modals/Delivery';

type Row = CampaignListItem & { publish?: string; showUpcoming?: boolean };
type Counts = Record<'all' | CampaignStatus, number>;
const TABS: Array<['' | CampaignStatus, string]> = [['', '전체'], ['scheduled', '모집 예정'], ['recruiting', '모집 중'], ['running', '진행 중'], ['closed', '마감'], ['draft', '임시 저장']];

/** 캠페인 관리 · 목록: 상태별 탭 · 검색 · 설정 · 참가자 · 복제 */
export function CampaignAdminList() {
  useAdminCrumbs(['캠페인']);
  const sim = useSim();
  const [sp, setSp] = useSearchParams();
  const status = (sp.get('status') ?? '') as '' | CampaignStatus;
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [clone, setClone] = useState<Row | null>(null);
  const [delivery, setDelivery] = useState<Row | null>(null);

  const query = useCallback((cursor?: string) => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (q.trim()) p.set('q', q.trim());
    if (cursor) p.set('cursor', cursor);
    return api<{ items: Row[]; nextCursor: string | null; counts: Counts }>(`/api/campaigns?${p}`, { quiet: true });
  }, [status, q]);

  const load = useCallback(() => {
    setFailed(false);
    let alive = true;
    const t = setTimeout(() => {
      query().then((r) => {
        if (!alive) return;
        setItems(r.items); setCounts(r.counts); setNext(r.nextCursor);
      }).catch(() => alive && setFailed(true));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);
  useEffect(() => load(), [load, sim.today]);

  const more = async () => {
    if (!next) return;
    const r = await query(next);
    setItems((l) => [...(l ?? []), ...r.items]);
    setNext(r.nextCursor);
  };

  const people = (c: Row) => (c.status === 'scheduled' ? `${(c.subscriberCount ?? 0).toLocaleString('ko-KR')}명 알림 신청` : `${c.participantCount.toLocaleString('ko-KR')}명 참여`);

  return (
    <div>
      <div className="adm-head">
        <div>
          <h1 className="adm-title">캠페인</h1>
          <p className="adm-lead">캠페인은 녹색전환연구소만 만들어요. 주최 모임은 연결할 수도, 연결하지 않을 수도 있어요.</p>
        </div>
        <ButtonLink to="/admin/campaigns/new" pill>+ 새 캠페인 만들기</ButtonLink>
      </div>
      <div className="adm-toolbar">
        <div className="adm-tabs" role="tablist" aria-label="상태">
          {TABS.map(([k, label]) => (
            <button key={k || 'all'} type="button" role="tab" aria-selected={status === k} className={`adm-tab${status === k ? ' is-on' : ''}`}
              onClick={() => setSp(k ? { status: k } : {}, { replace: true })}>
              {label} {counts ? counts[k || 'all'] : ''}
            </button>
          ))}
        </div>
        <input className="input adm-search" placeholder="⌕  캠페인 · 주최 모임 검색" aria-label="캠페인 · 주최 모임 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {failed ? <LoadError onRetry={load} /> : items === null ? <Spinner /> : items.length === 0 ? (
        <EmptyState title={q || status ? '조건에 맞는 캠페인이 없어요' : '아직 만든 캠페인이 없어요'} action={<ButtonLink to="/admin/campaigns/new" pill>+ 새 캠페인 만들기</ButtonLink>} />
      ) : (
        <div className="adm-table-wrap card adm-table-card">
          <table className="adm-table">
            <thead><tr><th>캠페인</th><th>주최 모임</th><th>유형</th><th>상태</th><th>기간</th><th>인원</th><th>관리</th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/admin/campaigns/${c.id}/edit`} className="adm-strong">{c.title || '이름 없는 캠페인'}</Link>
                    {c.status === 'scheduled' && c.publish === 'scheduled' && c.schedule.recruitStart && (
                      <small className="adm-sub">{md(c.schedule.recruitStart)} {c.schedule.recruitStartTime ?? '00:00'} 모집 시작 예약</small>
                    )}
                  </td>
                  <td>{c.host.name}</td>
                  <td>{TYPE_LABEL[c.type]}</td>
                  <td><Chip tone={STATUS_TONE[c.status]} square>{STATUS_LABEL[c.status]}</Chip></td>
                  <td>{periodLabel(c) || '–'}</td>
                  <td>{c.status === 'draft' ? '–' : people(c)}</td>
                  <td className="adm-actions">
                    <Link to={`/admin/campaigns/${c.id}/edit`}>설정</Link>
                    <Link to={`/admin/campaigns/${c.id}/participants`}>참가자</Link>
                    <button type="button" onClick={() => setClone(c)}>복제</button>
                    {c.type === 'signature' && c.status === 'closed' && <button type="button" onClick={() => setDelivery(c)}>전달 결과</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {next && <div className="adm-more-row"><button type="button" className="btn btn-outline btn-md btn-pill" onClick={() => void more()}>더 보기</button></div>}
      <p className="adm-muted adm-foot-note">「복제」로 지난 캠페인의 설정(미션, 체크리스트, 맞춤 영역)을 그대로 가져와 새 기수를 만들 수 있어요. 「설정」은 유형에 맞는 설정 화면으로 열려요.</p>
      {clone && <CloneModal source={clone} onClose={() => setClone(null)} />}
      {delivery && <DeliveryModal campaignId={delivery.id} onClose={() => setDelivery(null)} />}
    </div>
  );
}
