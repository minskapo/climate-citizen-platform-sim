import { useEffect, useState } from 'react';
import { LoadError, Spinner } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { API_BASE, api, downloadBlob, simHeaders } from '../../lib/api';
import { TYPE_LABEL, type CampaignListItem } from '../campaigns/types';
import { useAdminCrumbs } from './AdminLayout';

interface Home {
  status: { users: number; openCampaigns: number; groups: number; postsThisWeek: number; measurements: number };
  last7: { days: string[]; users: number[]; posts: number[]; participations: number[]; records: number[] };
}

/** 데이터 · 통계: 숫자 요약 · 최근 7일 · 캠페인별 연구용 CSV */
export function DataStats() {
  useAdminCrumbs(['데이터 · 통계']);
  const [home, setHome] = useState<Home | null>(null);
  const [camps, setCamps] = useState<CampaignListItem[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api<Home>('/api/admin/home', { quiet: true }).then(setHome).catch(() => setFailed(true));
    api<{ items: CampaignListItem[] }>('/api/campaigns', { quiet: true }).then((r) => setCamps(r.items.filter((c) => c.status !== 'draft'))).catch(() => undefined);
  }, []);

  const download = async (c: CampaignListItem) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/campaigns/${c.id}/export?kind=research`, { headers: simHeaders() });
      if (!res.ok) throw new Error();
      downloadBlob(await res.blob(), `participants-research-${c.id}.csv`);
      showToast('연구용 기록을 내려받았어요 · CSV');
    } catch {
      showToast('내려받지 못했어요');
    }
  };

  if (failed) return <LoadError onRetry={() => window.location.reload()} />;
  if (!home) return <Spinner />;
  const s = home.status;
  const nn = (v: number) => v.toLocaleString('ko-KR');
  const rows: Array<[string, number[]]> = [['새 회원', home.last7.users], ['새 글', home.last7.posts], ['캠페인 참여', home.last7.participations], ['미션 기록', home.last7.records]];
  return (
    <div>
      <div className="adm-head"><div><h1 className="adm-title">데이터 · 통계</h1><p className="adm-lead">운영 숫자를 한눈에 보고, 연구용 익명 기록을 내려받아요.</p></div></div>
      <div className="adm-stats" role="list">
        {([['회원', s.users], ['열린 캠페인', s.openCampaigns], ['운영 중인 모임', s.groups], ['이번 주 새 글', s.postsThisWeek], ['계산 기록', s.measurements]] as const).map(([l, v]) => (
          <div key={l} className="adm-stat" role="listitem"><span>{l}</span><b>{nn(v)}</b></div>
        ))}
      </div>
      <h2 className="adm-h2">최근 7일</h2>
      <div className="adm-table-wrap card adm-table-card">
        <table className="adm-table">
          <thead><tr><th>항목</th>{home.last7.days.map((d) => <th key={d}>{d.slice(5).replace('-', '. ')}.</th>)}</tr></thead>
          <tbody>{rows.map(([l, v]) => <tr key={l}><td className="adm-strong">{l}</td>{v.map((x, i) => <td key={i}>{nn(x)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <h2 className="adm-h2 adm-gap">연구용 기록 내려받기</h2>
      <div className="adm-table-wrap card adm-table-card">
        <table className="adm-table">
          <thead><tr><th>캠페인</th><th>유형</th><th>참여</th><th>내려받기</th></tr></thead>
          <tbody>
            {camps.map((c) => (
              <tr key={c.id}>
                <td className="adm-strong">{c.title}</td><td>{TYPE_LABEL[c.type]}</td><td>{nn(c.participantCount)}명</td>
                <td className="adm-actions"><button type="button" aria-label={`${c.title} 연구용 CSV`} onClick={() => void download(c)}>연구용 CSV</button></td>
              </tr>
            ))}
            {camps.length === 0 && <tr><td colSpan={4} className="adm-empty">공개된 캠페인이 없어요</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="adm-muted adm-foot-note">연구용 기록은 연구 활용에 동의한 참가자만, 활동명 없이 일련번호로 담겨요. 내려받은 기록은 관리자 활동 기록에 남아요.</p>
    </div>
  );
}
