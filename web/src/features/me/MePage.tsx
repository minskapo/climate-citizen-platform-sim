import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { koShort } from '@shared/date';
import { missionForDate, missionLabel } from '@shared/missions';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { NotificationsPanel } from '../../components/NotificationsPanel';
import { ButtonLink, Chip, EmptyState, Spinner } from '../../components/ui';
import { periodLabel, statusFor, STATUS_LABEL, STATUS_TONE, type CampaignDetail } from '../campaigns/types';
import type { RecordsResponse } from '../practice/types';
import { runningPractice } from '../home/Hero';
import { useMyCampaigns, useMyGroups } from '../home/data';
import { regionLabel, type GroupView } from '../groups/types';
import { MyCarbonRecords } from './MyCarbonRecords';
import { RecordSettingsCard } from './RecordSettings';
import './me.css';

type Rec = Record<string, RecordsResponse | null>;

function personalChip(d: CampaignDetail, today: string, rec: RecordsResponse | null | undefined): { text: string; tone: 'yellow' | 'green' | 'gray' } {
  const m = d.myParticipation!;
  if (m.state === 'signed') return { text: '서명 완료', tone: 'green' };
  if (m.state === 'waitlisted') return { text: '대기 중', tone: 'gray' };
  if (m.state === 'quit') return { text: '그만둠', tone: 'gray' };
  if (d.campaign.type === 'practice') {
    if (rec && rec.isSlotToday) return rec.records.some((r) => r.slotDate === today) ? { text: '오늘 기록함', tone: 'green' } : { text: '오늘 미기록', tone: 'yellow' };
    if (m.paused) return { text: '쉬어 가는 중', tone: 'gray' };
  }
  return { text: '신청 완료', tone: 'green' };
}

function MissionHero({ d, rec }: { d: CampaignDetail; rec: RecordsResponse | null | undefined }) {
  const sim = useSim();
  const c = d.campaign;
  const cycle = c.settings.missionCycle ?? 'daily';
  const mission = missionForDate(d.missions, cycle, c.schedule.runStart!, sim.today, c.schedule.runDays ?? undefined);
  const pct = rec && rec.progress.total ? Math.round((rec.progress.done / rec.progress.total) * 100) : 0;
  return (
    <section className="me-mission" aria-label="지금 미션">
      <div className="me-mission-top">
        <Chip tone="navy" square>진행 중</Chip><span>{c.title}</span>
        {rec && <b>{rec.progress.done} / {rec.progress.total}일 기록</b>}
      </div>
      <h2>{mission ? `${missionLabel(cycle)}: ${mission.title}` : '오늘도 함께해요'}</h2>
      <div className="cprog-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
      <div className="me-mission-btns">
        <ButtonLink to={`/campaigns/${c.id}`} variant="outline" className="me-btn-white">오늘 기록하기</ButtonLink>
        <ButtonLink to={`/campaigns/${c.id}`} variant="outline" className="me-btn-line">참가자 게시판 가기</ButtonLink>
      </div>
    </section>
  );
}

function GroupRow({ g }: { g: GroupView }) {
  return (
    <li className="me-row">
      <span className="gcard-avatar" aria-hidden="true">{[...g.name][0]}</span>
      <div className="me-row-main">
        <b>{g.name}</b>
        <span>{regionLabel(g)} · {(g.memberCount ?? 0).toLocaleString('ko-KR')}명{g.campaign ? ` · ${g.campaign.title} 주최` : ''}</span>
      </div>
      {(g.newPostsThisWeek ?? 0) > 0 && <Chip tone="green">새 글 {g.newPostsThisWeek}</Chip>}
      <Link to={`/groups/${g.id}`} className="me-more">자세히 보기 →</Link>
    </li>
  );
}

/** E 내 활동 (+ 알림함 탭) */
export function MePage() {
  const sim = useSim();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'notifications' ? 'notifications' : 'activity';
  const [mine] = useMyCampaigns();
  const [groups] = useMyGroups();
  const [recs, setRecs] = useState<Rec>({});
  const signed = sim.role !== 'guest' && !!sim.userId;

  const running = runningPractice(mine, sim.today);
  useEffect(() => {
    if (!mine) return;
    let alive = true;
    const targets = mine.filter((d) => d.campaign.type === 'practice' && d.myParticipation && d.myParticipation.state === 'applied' && d.campaign.settings.recordEnabled !== false);
    targets.forEach((d) => {
      api<RecordsResponse>(`/api/participations/${d.myParticipation!.id}/records`, { quiet: true })
        .then((r) => alive && setRecs((x) => ({ ...x, [d.myParticipation!.id]: r }))).catch(() => undefined);
    });
    return () => { alive = false; };
  }, [mine, sim.today]);

  if (!signed) {
    return (
      <div className="container page">
        <EmptyState title="로그인하면 내 활동을 볼 수 있어요" action={<Link to="/login" className="btn btn-primary btn-md">로그인</Link>}>
          참여 중인 캠페인과 가입한 모임, 나의 탄소 기록을 한곳에서 봐요.
        </EmptyState>
      </div>
    );
  }

  const past = (mine ?? []).filter((d) => statusFor({ ...d.campaign }, sim.today) === 'closed' || d.status === 'closed');
  const pastIds = new Set(past.map((d) => d.campaign.id));
  const current = (mine ?? []).filter((d) => !pastIds.has(d.campaign.id));

  return (
    <div className="container page me">
      <div className="me-head">
        <div>
          <h1 className="page-title">{sim.nickname} 님의 활동</h1>
          <p className="me-lead">참여 중인 캠페인과 가입한 모임, 나의 탄소 기록을 한곳에서 봐요.</p>
        </div>
        <Link to="/me/settings" className="btn btn-outline btn-md">계정 설정</Link>
      </div>
      <div className="me-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'on' : ''} onClick={() => setSp({})}>내 활동</button>
        <button type="button" role="tab" aria-selected={tab === 'notifications'} className={tab === 'notifications' ? 'on' : ''} onClick={() => setSp({ tab: 'notifications' })}>알림</button>
      </div>
      {tab === 'notifications' ? <section className="card"><NotificationsPanel /></section> : (
        <div className="me-grid">
          <div className="me-main">
            {running && <MissionHero d={running} rec={recs[running.myParticipation!.id]} />}
            <section className="card" aria-label="참여 중인 캠페인">
              <div className="me-sec-head"><h2>참여 중인 캠페인</h2><Link to="/campaigns">전체 보기 →</Link></div>
              {mine === null ? <Spinner /> : current.length === 0
                ? <p className="me-empty">참여 중인 캠페인이 없어요. <Link to="/campaigns">캠페인 둘러보기</Link></p>
                : (
                  <ul className="me-rows">
                    {current.map((d) => {
                      const chip = personalChip(d, sim.today, recs[d.myParticipation!.id]);
                      const st = statusFor(d.campaign, sim.today);
                      const rec = recs[d.myParticipation!.id];
                      return (
                        <li key={d.campaign.id} className="me-row">
                          <div className="me-row-main">
                            <span className="me-row-title"><Chip tone={STATUS_TONE[st]} square>{STATUS_LABEL[st]}</Chip><b>{d.campaign.title}</b></span>
                            <span>{[d.campaign.host.name, periodLabel(d.campaign), rec ? `${rec.progress.done} / ${rec.progress.total}일 기록` : ''].filter(Boolean).join(' · ')}</span>
                          </div>
                          <Chip tone={chip.tone}>{chip.text}</Chip>
                          <Link to={`/campaigns/${d.campaign.id}`} className="me-more">자세히 보기 →</Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
            </section>
            <section className="card" aria-label="가입한 모임">
              <div className="me-sec-head"><h2>가입한 모임</h2><Link to="/groups">전체 보기 →</Link></div>
              {groups === null ? <Spinner /> : groups.length === 0
                ? <p className="me-empty">가입한 모임이 없어요. <Link to="/groups">모임 둘러보기</Link></p>
                : <ul className="me-rows">{groups.map((g) => <GroupRow key={g.id} g={g} />)}</ul>}
            </section>
            <section className="card" aria-label="지난 캠페인">
              <div className="me-sec-head"><h2>지난 캠페인</h2></div>
              {mine === null ? <Spinner /> : past.length === 0
                ? <p className="me-empty">마친 캠페인이 아직 없어요.</p>
                : (
                  <ul className="me-rows">
                    {past.map((d) => (
                      <li key={d.campaign.id} className="me-row">
                        <div className="me-row-main">
                          <span className="me-row-title"><Chip tone="gray" square>마감</Chip><b>{d.campaign.title}</b></span>
                          <span>{periodLabel(d.campaign)}{d.myParticipation?.state === 'signed' ? ' · 서명 완료' : ''}</span>
                        </div>
                        <Link to={`/campaigns/${d.campaign.id}`} className="me-more">{d.campaign.type === 'practice' ? '내 후기 보기 →' : '자세히 보기 →'}</Link>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          </div>
          <aside className="me-side">
            <MyCarbonRecords />
            <RecordSettingsCard />
            <div className="me-open">
              <h3>우리 동네 모임을 열어 볼까요?</h3>
              <p>한달살기를 마쳤다면 동네 사람들과 모임을 만들어 이어 가요.</p>
              <Link to="/groups/new">모임 만들기 →</Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
