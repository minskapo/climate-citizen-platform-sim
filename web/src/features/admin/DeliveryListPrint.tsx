import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { Button, LoadError, Spinner } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useAdminCrumbs } from './AdminLayout';
import { md } from './editor/model';

/** 전달용 명단 만들기: 의회별로 모두 / 한 의회만 → 인쇄용 화면으로 연다. */
export function DeliveryListModal({ campaignId, councils, total, closeDate, onClose }: {
  campaignId: string; councils: Array<[string, number]>; total: number; closeDate: string | null; onClose(): void;
}) {
  const nav = useNavigate();
  const [mode, setMode] = useState<'all' | 'one'>('all');
  const [one, setOne] = useState(councils[0]?.[0] ?? '');
  const count = councils.find(([name]) => name === one)?.[1] ?? 0;

  const make = () => {
    const council = mode === 'all' ? 'all' : one;
    nav(`/admin/campaigns/${campaignId}/delivery-list?council=${encodeURIComponent(council)}`);
    showToast(mode === 'all' ? `전달용 명단을 만들었어요 · ${councils.length}개 의회` : `전달용 명단을 만들었어요 · ${one}`);
  };

  return (
    <Modal
      open onClose={onClose} title="전달용 명단 만들기" description="의회에 낼 명단을 만들어요. 활동명 · 지역 · 서명일만 담겨요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button disabled={councils.length === 0} onClick={make}>명단 만들기</Button></>}
    >
      <div className="ed-modal-form">
        <label className="adm-radio"><input type="radio" name="dl" checked={mode === 'all'} onChange={() => setMode('all')} />
          <span><b>의회별로 모두 · {councils.length}개 의회</b><small>의회마다 쪽을 나눠서, 한 번에 인쇄하거나 PDF로 저장해요 · 서명 {total.toLocaleString('ko-KR')}명</small></span></label>
        <label className="adm-radio"><input type="radio" name="dl" checked={mode === 'one'} onChange={() => setMode('one')} />
          <span>
            <b>한 의회만</b>
            <select className="input" aria-label="의회 고르기" value={one} onChange={(e) => { setOne(e.target.value); setMode('one'); }}>
              {councils.map(([name]) => <option key={name} value={name}>{name}</option>)}
            </select>
            <small>{count.toLocaleString('ko-KR')}명 · 쪽 하나</small>
          </span></label>
        <p className="ed-hint">{closeDate ? `마감(${md(closeDate)}) 뒤에 만든 명단을 전달에 써요. ` : ''}만든 기록은 관리자 활동 기록에 남아요.</p>
      </div>
    </Modal>
  );
}

interface ListData { title: string; councils: Array<{ name: string; count: number; items: Array<{ nickname: string; region: string; signedOn: string }> }> }

/** /admin/campaigns/:id/delivery-list?council=all|이름 — 인쇄용 명단 (의회마다 한 쪽) */
export function DeliveryListPrint() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const council = sp.get('council') || 'all';
  const [data, setData] = useState<ListData | null>(null);
  const [failed, setFailed] = useState(false);
  useAdminCrumbs(['캠페인', data?.title ?? '…', '전달용 명단']);

  useEffect(() => {
    let alive = true;
    api<ListData>(`/api/admin/campaigns/${id}/delivery-list`, { body: { council }, quiet: true })
      .then((r) => alive && setData(r))
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [id, council]);

  if (failed) return <LoadError onRetry={() => window.location.reload()} />;
  if (!data) return <Spinner />;
  return (
    <div className="dl-print">
      <div className="adm-head no-print">
        <div>
          <h1 className="adm-title">전달용 명단</h1>
          <p className="adm-lead">{data.title} · {council === 'all' ? `의회 ${data.councils.length}곳` : council} · 활동명 · 지역 · 서명일만 담았어요. 인쇄 창에서 「PDF로 저장」을 고르면 파일이 돼요.</p>
        </div>
        <div className="adm-head-actions">
          <Link to={`/admin/campaigns/${id}/participants`} className="btn btn-outline btn-md btn-pill">← 서명자 화면</Link>
          <Button pill onClick={() => window.print()}>인쇄하기</Button>
        </div>
      </div>
      {data.councils.length === 0 && <p className="adm-muted">담을 서명이 없어요</p>}
      {data.councils.map((c) => (
        <section key={c.name} className="dl-sheet" aria-label={c.name}>
          <h2 className="dl-title">{c.name} 전달용 서명 명단</h2>
          <p className="dl-sub">{data.title} · 서명 {c.count.toLocaleString('ko-KR')}명</p>
          <table className="dl-table">
            <thead><tr><th>활동명</th><th>지역</th><th>서명일</th></tr></thead>
            <tbody>
              {c.items.map((i, k) => <tr key={k}><td>{i.nickname}</td><td>{i.region || '–'}</td><td>{md(i.signedOn)}</td></tr>)}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
