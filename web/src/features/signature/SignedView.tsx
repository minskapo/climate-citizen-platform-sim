import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSim } from '../../lib/sim';
import { Button, Chip } from '../../components/ui';
import { copyShareLink } from '../../lib/share';
import type { CampaignDetail } from '../campaigns/types';
import { CancelSignModal } from './CancelSignModal';
import { md, n } from './fmt';
import { CountBlock, headerLine, ShareButton, SignLayout, sigSettings, visibleCount, type Aggregate } from './parts';

/** S-2 서명 완료: 몇 번째 서명 · 이어서 해 보세요 · 서명 취소(마감 전까지) */
export function SignedView({ detail, agg, reload }: { detail: CampaignDetail; agg: Aggregate | null; reload(): Promise<void> }) {
  const sim = useSim();
  const [cancelling, setCancelling] = useState(false);
  const [shared, setShared] = useState(false);
  const [visitedHost, setVisitedHost] = useState(false);
  const [read, setRead] = useState(false);
  const c = detail.campaign;
  const s = sigSettings(detail);
  const mine = detail.myParticipation!;
  const sch = c.schedule;
  const referred = mine.referredCount ?? 0;
  const count = visibleCount(detail, agg);
  const goal = s.countDisplay === 'count_and_rate' ? s.goal : 0;
  const toGo = goal > 0 && count != null ? Math.max(0, goal - count) : null;
  const hostLinked = c.host.type === 'group' && !!c.host.id;
  const closeLabel = sch.recruitEnd ? md(sch.recruitEnd) : '마감';

  const steps: Array<{ key: string; done: boolean; title: string; sub?: string; action: React.ReactNode }> = [
    {
      key: 'share', done: shared || referred > 0, title: '친구에게 공유하기',
      sub: referred > 0 ? `공유 링크를 복사했어요 · 링크로 ${referred}명이 서명했어요` : '내 링크로 서명한 사람 수를 알려 드려요',
      action: <button type="button" className="link-btn" onClick={() => { void copyShareLink(c.id, sim.userId).then((ok) => ok && setShared(true)); }}>{shared || referred > 0 ? '다시 공유 →' : '공유하기 →'}</button>,
    },
    ...(s.deliveryNotice ? [{
      key: 'notice', done: true, title: '전달 결과 알림 받기',
      sub: `${sch.deliveryDate ? `${md(sch.deliveryDate)} ` : ''}전달 뒤 알림함 · 앱 푸시로 알려 드려요`,
      action: <span className="sig-note">켜져 있어요</span>,
    }] : []),
    ...(hostLinked ? [{
      key: 'host', done: visitedHost, title: '주최 모임 둘러보기', sub: `${c.host.name}`,
      action: <Link className="link-btn" to={`/groups/${c.host.id}`} onClick={() => setVisitedHost(true)}>모임 보기 →</Link>,
    }] : []),
    ...(detail.explainer ? [{
      key: 'read', done: read, title: '관련 자료 읽기', sub: detail.explainer.title,
      action: <a className="link-btn" href="#explainer" onClick={(e) => { e.preventDefault(); setRead(true); document.getElementById('explainer')?.scrollIntoView({ behavior: 'smooth' }); }}>읽기 →</a>,
    }] : []),
  ];

  const lead = (
    <section className="card sig-next" aria-label="이어서 해 보세요">
      <div className="sig-next-head"><h2 className="csec-title">이어서 해 보세요</h2><span className="sig-note">{steps.filter((x) => x.done).length} / {steps.length}</span></div>
      <ul>
        {steps.map((x) => (
          <li key={x.key} className={x.done ? 'done' : undefined}>
            <span className="sig-check" aria-hidden="true">{x.done ? '✓' : ''}</span>
            <div><strong>{x.title}</strong>{x.sub && <p className="sig-note">{x.sub}</p>}</div>
            {x.action}
          </li>
        ))}
      </ul>
      <div className="sig-next-foot">
        <p className="sig-note">{closeLabel} 마감 전까지 「서명 취소」로 철회할 수 있어요.</p>
        <Button variant="outline" onClick={() => setCancelling(true)}>서명 취소</Button>
      </div>
    </section>
  );
  const side = (
    <section className="card capply sig-card" aria-label="서명">
      <CountBlock detail={detail} agg={agg} />
      <p className="sig-done"><strong>서명했어요!{mine.signatureNo && s.countDisplay !== 'hidden' ? ` ${n(mine.signatureNo)}번째 서명이에요` : ''}</strong></p>
      {toGo != null && <p className="capply-line">목표까지 {n(toGo)}명</p>}
      {sch.recruitEnd && sch.deliveryDate && <p className="capply-note">{md(sch.recruitEnd)}에 서명을 마감하고 {md(sch.deliveryDate)}에 사는 지역의 의회로 전달해요. 전달 결과와 답변은 알림으로 알려 드릴게요.</p>}
      <ShareButton detail={detail} onShared={() => setShared(true)} />
      {cancelling && <CancelSignModal participationId={mine.id} closeLabel={closeLabel} referred={referred} onClose={() => setCancelling(false)} onCancelled={() => { void reload(); }} />}
    </section>
  );
  return (
    <SignLayout
      detail={detail} agg={agg} screen="signed" lead={lead} side={side}
      chip={<Chip tone="solid" square>서명 완료</Chip>}
      line={headerLine(detail, agg, sim.today, false, false)}
    />
  );
}
