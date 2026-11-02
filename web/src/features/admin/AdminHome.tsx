import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { koLong } from '@shared/date';
import type { CampaignStatus, CampaignType } from '@shared/types';
import { Chip, EmptyState, LoadError, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from '../campaigns/types';
import { useAdminCrumbs } from './AdminLayout';
import { md } from './editor/model';

interface HomeData {
  tasks: { openReports: number; openCollab: Array<{ id: string; title: string; dueAt: string | null }>; pendingTools: number; scheduledCampaigns: Array<{ id: string; title: string; recruitStart: string | null }> };
  status: { users: number; openCampaigns: number; groups: number; postsThisWeek: number; measurements: number };
  campaigns: Array<{ id: string; title: string; type: CampaignType; status: CampaignStatus; participants: number; recentRecordRate: number | null }>;
  last7: { days: string[]; users: number[]; posts: number[]; participations: number[]; records: number[] };
}

const n = (v: number) => v.toLocaleString('ko-KR');
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** 관리자 홈: 처리할 일 · 운영 현황 · 운영 중인 캠페인 · 최근 7일 */
export function AdminHome() {
  useAdminCrumbs(['홈']);
  const sim = useSim();
  const [data, setData] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api<HomeData>('/api/admin/home', { quiet: true }).then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load, sim.today]);

  if (failed) return <LoadError onRetry={load} />;
  if (!data) return <Spinner />;
  const { tasks, status, campaigns, last7 } = data;
  const taskCount = (tasks.openReports ? 1 : 0) + (tasks.openCollab.length ? 1 : 0) + (tasks.pendingTools ? 1 : 0) + (tasks.scheduledCampaigns.length ? 1 : 0);

  const stats: Array<[string, string]> = [
    ['회원', `${n(status.users)}명`],
    ['열린 캠페인', `${n(status.openCampaigns)}개`],
    ['모임', `${n(status.groups)}개`],
    ['이번 주 새 글', `${n(status.postsThisWeek)}개`],
    ['1.5도 계산기 측정', `${n(status.measurements)}회`],
  ];
  const week: Array<[string, string]> = [
    ['새 회원', `${n(sum(last7.users))}명`],
    ['새 글', `${n(sum(last7.posts))}개`],
    ['캠페인 신청', `${n(sum(last7.participations))}건`],
    ['미션 기록', `${n(sum(last7.records))}번`],
  ];

  return (
    <div className="adm-home">
      <h1 className="adm-title">관리자 홈</h1>
      <p className="adm-lead">{koLong(sim.today)} 기준 · 처리할 일과 운영 현황을 한눈에 봐요.</p>
      <div className="adm-stats">
        {stats.map(([k, v]) => <div key={k} className="adm-stat"><span>{k}</span><b>{v}</b></div>)}
      </div>
      <div className="adm-home-grid">
        <section className="card">
          <h2 className="adm-h2">처리할 일 <span className="adm-muted">{taskCount}건</span></h2>
          {taskCount === 0 && <EmptyState title="지금 처리할 일이 없어요" />}
          <ul className="adm-tasks">
            {tasks.openReports > 0 && (
              <li><Chip tone="red" square>신고</Chip><span>신고 {tasks.openReports}건</span><Link to="/admin/reports">처리하기 →</Link></li>
            )}
            {tasks.openCollab.length > 0 && (
              <li>
                <Chip tone="blue" square>협업 제안</Chip>
                <span>캠페인 협업 제안 {tasks.openCollab.length}건<small>{tasks.openCollab.slice(0, 3).map((c) => c.title).join(' · ')}</small></span>
                <Link to="/admin/collab">검토하기 →</Link>
              </li>
            )}
            {tasks.pendingTools > 0 && (
              <li><Chip tone="yellow" square>웹 도구</Chip><span>게시 대기 {tasks.pendingTools}건</span><Link to="/admin/tools">게시하기 →</Link></li>
            )}
            {tasks.scheduledCampaigns.length > 0 && (
              <li>
                <Chip tone="green" square>캠페인</Chip>
                <span>모집 시작 예약 {tasks.scheduledCampaigns.length}건<small>{tasks.scheduledCampaigns.slice(0, 3).map((c) => `${c.title}${c.recruitStart ? ` · ${md(c.recruitStart)} 모집 시작` : ''}`).join(' · ')}</small></span>
                <Link to="/admin/campaigns?status=scheduled">확인하기 →</Link>
              </li>
            )}
          </ul>
        </section>
        <section className="card">
          <h2 className="adm-h2">운영 중인 캠페인 <Link to="/admin/campaigns" className="adm-more">전체 보기 →</Link></h2>
          {campaigns.length === 0 ? <EmptyState title="모집 중이거나 진행 중인 캠페인이 없어요" /> : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr><th>캠페인</th><th>상태</th><th>인원</th><th>최근 기록률</th></tr></thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/admin/campaigns/${c.id}/edit`}>{c.title}</Link><small className="adm-muted"> {TYPE_LABEL[c.type]}</small></td>
                      <td><Chip tone={STATUS_TONE[c.status]} square>{STATUS_LABEL[c.status]}</Chip></td>
                      <td>{n(c.participants)}명</td>
                      <td>{c.recentRecordRate === null ? '–' : `${Math.round(c.recentRecordRate * 100)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <section className="card adm-week">
        <h2 className="adm-h2">최근 7일</h2>
        <div className="adm-stats adm-stats-4">
          {week.map(([k, v]) => <div key={k} className="adm-stat"><span>{k}</span><b>{v}</b></div>)}
        </div>
        <p className="adm-muted">자세한 통계와 익명 집계 내려받기는 「데이터 · 통계」에서 해요.</p>
      </section>
    </div>
  );
}
