import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dDay, koShort } from '@shared/date';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { showToast } from '../../components/Toast';
import { Button } from '../../components/ui';
import type { AppliedCampaign } from './K5Campaigns';
import { ObFrame } from './OnboardingFlow';

/** K-7 준비 완료 */
export function K7Done({ applied, joined }: { applied: AppliedCampaign[]; joined: string[] }) {
  const sim = useSim();
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ items: Array<{ result: { total: number } }> }>('/api/me/measurements', { quiet: true })
      .then((r) => alive && r.items?.[0] && setTotal(r.items[0].result.total)).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const first = applied.find((a) => a.type !== 'signature') ?? applied[0];
  const groups = [...new Set([...applied.filter((a) => a.hostGroupId && a.type !== 'signature').map((a) => a.hostName), ...joined])];
  return (
    <ObFrame>
      <h1>준비가 끝났어요!</h1>
      {first?.startDate && <p className="ob-lead">{koShort(first.startDate)}에 {first.title}이(가) 시작돼요. 그 전에 참가자 게시판에서 인사를 나눠 보세요.</p>}
      <div className="ob-sum">
        {total != null && <div><small>저장한 결과</small>나의 1년 탄소 {total.toFixed(1)}톤</div>}
        {applied.length > 0 && <div><small>신청한 캠페인</small>{applied.map((a) => a.title + (a.startDate && !a.signed ? ` · ${koShort(a.startDate)} 시작 · ${dDay(sim.today, a.startDate)}` : '')).join(', ')}</div>}
        {groups.length > 0 && <div><small>가입한 모임</small>{groups.join(', ')}</div>}
        <div><small>앱을 설치하면 미션 알림을 놓치지 않아요</small>저녁 8시, 아직 기록하지 않았으면 잊지 않게 알려 드려요.
          <div style={{ marginTop: 8, border: 0, padding: 0 }}><Button variant="outline" size="sm" pill onClick={() => showToast('앱 설치는 체험판에서 건너뛰어요')}>앱 설치하기</Button></div>
        </div>
      </div>
      <div className="ob-acts">
        {first && <Link className="btn btn-primary btn-lg btn-block" to={`/campaigns/${first.id}`}>참가자 게시판에 인사하기</Link>}
        <Link className="btn btn-outline btn-lg btn-block" to="/me">내 활동 보기</Link>
      </div>
    </ObFrame>
  );
}
