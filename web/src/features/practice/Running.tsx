import { useState } from 'react';
import { Link } from 'react-router-dom';
import { diffDays, koShort } from '@shared/date';
import { missionForDate, missionLabel } from '@shared/missions';
import { useSim } from '../../lib/sim';
import { Chip, Spinner } from '../../components/ui';
import { BlockSlotView } from '../campaigns/BlockSlotView';
import { HostCard } from '../campaigns/HostCard';
import { ParticipantBoard, postPath, useBoardPosts } from '../campaigns/ParticipantBoard';
import { runEndOf, type CampaignDetail } from '../campaigns/types';
import { ComebackBanner } from './ComebackBanner';
import { PauseQuitModal } from './PauseQuitModal';
import { RecordCalendar, unitOf } from './RecordCalendar';
import { RecordForm } from './RecordForm';
import { fieldsFor, mdOf, type usePracticeData } from './usePractice';

type Data = ReturnType<typeof usePracticeData>;
export const COMEBACK_AFTER = 3;

/** 나의 진행: 기록 n / 전체 m */
export function ProgressCard({ detail, data, showLeft }: { detail: CampaignDetail; data: Data; showLeft?: boolean }) {
  const sim = useSim();
  const r = data.records;
  const unit = unitOf(detail);
  const end = runEndOf(detail.campaign);
  const left = end ? Math.max(0, diffDays(sim.today, end)) : null;
  const pct = r && r.progress.total ? Math.round((r.progress.done / r.progress.total) * 100) : 0;
  const start = data.start ? `출발점 ${data.start.result.total.toFixed(1)}톤` : null;
  const tail = showLeft || !start || !end ? (left != null ? `남은 날 ${left}일` : null) : `${mdOf(end)}에 다시 재요`;
  return (
    <section className="card cprog" aria-label="나의 진행">
      <p className="chost-label">나의 진행</p>
      <p className="cprog-num"><strong>{r?.progress.done ?? 0}</strong> / {r?.progress.total ?? 0}{unit} 기록</p>
      <div className="cprog-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
      <p className="cprog-sub">{[start, tail].filter(Boolean).join(' · ')}</p>
    </section>
  );
}

/** 다가오는 일정 카드 대신: 참가자 게시판의 가장 최근 공지 */
export function LatestNotice({ detail }: { detail: CampaignDetail }) {
  const { items } = useBoardPosts(detail.campaign.id, { category: '공지', enabled: true });
  const p = items?.[0];
  if (!p) return null;
  const d = p.simDate ?? p.createdAt.slice(0, 10);
  const excerpt = (p as unknown as { excerpt?: string }).excerpt;
  return (
    <section className="cnotice" aria-label="공지">
      <Chip tone="outline">공지 · {koShort(d)}</Chip>
      <h2>{p.title}</h2>
      {excerpt && <p>{excerpt}</p>}
      <Link to={postPath(detail.campaign.id, p.id)} className="btn btn-outline btn-md btn-block">읽기</Link>
    </section>
  );
}

/** H-3 진행 중 (+ H-3a 다시 시작 배너) */
export function Running({ detail, data, onChanged }: { detail: CampaignDetail; data: Data; onChanged(): Promise<void> | void }) {
  const sim = useSim();
  const c = detail.campaign;
  const s = c.settings;
  const mine = detail.myParticipation!;
  const [quit, setQuit] = useState(false);
  const runStart = c.schedule.runStart!;
  const runDays = c.schedule.runDays ?? 0;
  const cycle = s.missionCycle ?? 'daily';
  const today = sim.today;
  const dayNo = diffDays(runStart, today) + 1;
  const mission = missionForDate(detail.missions, cycle, runStart, today, runDays);
  const r = data.records;
  const recording = s.recordEnabled !== false;
  const daily = s.recordCycle === 'daily';
  const comeback = recording && !!r && s.missedAlert !== false && !mine.paused && r.missedStreak >= COMEBACK_AFTER;
  const todayRecord = r?.records.find((x) => x.slotDate === today) ?? null;
  const round = cycle === 'weekly' ? `${Math.floor((dayNo - 1) / 7) + 1}주차` : '';
  const tag = [round, mission?.category].filter(Boolean).join(' · ');
  const scrollToMission = () => document.getElementById('today-mission')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const [boardKey, setBoardKey] = useState(0);
  const refresh = () => { void onChanged(); };
  /** 기록을 저장하면 「참가자 게시판에도 인증 올리기」 글이 생길 수 있어 오늘의 인증도 다시 불러온다. */
  const onRecordSaved = () => { refresh(); setBoardKey((k) => k + 1); };

  return (
    <div className="cdetail">
      <div className="cdetail-main">
        {comeback && r && (
          <ComebackBanner
            missed={r.missedStreak} participants={detail.counts.participants} participationId={mine.id} backfillable={r.backfillable}
            fields={fieldsFor(detail, r.backfillable[0] ?? today)} numberUnit={s.numberUnit} pauseUsed={mine.pauseUsed} daily={daily}
            onToday={scrollToMission} onChanged={refresh}
          />
        )}
        {mine.paused && mine.pausedUntil && (
          <section className="cpaused" aria-label="쉬어 가는 중">
            <strong>쉬어 가는 중이에요</strong>
            <p>{koShort(mine.pausedUntil)}까지 미션 알림이 오지 않고, 기록하지 않은 날은 「쉬어 감」으로 표시돼요. 기록은 언제든 할 수 있어요.</p>
          </section>
        )}
        <BlockSlotView campaignId={c.id} screen="running" slot="top" />
        <section className="card cmission" id="today-mission" aria-label={missionLabel(cycle)}>
          <div className="cmission-top">
            {tag && <Chip tone="green" square>{tag}</Chip>}
            <span className="cmission-day">{dayNo}일째 · {koShort(today)}</span>
            {recording && data.todayCount != null && <span className="cmission-count">오늘 {data.todayCount.toLocaleString('ko-KR')}명 기록</span>}
          </div>
          <h2 className="cmission-title">{mission ? `${missionLabel(cycle)}: ${mission.title}` : '오늘도 함께해요'}</h2>
          {mission?.description && <p className="cmission-desc">{mission.description}</p>}
          {recording && !r && <Spinner />}
          {recording && r && r.isSlotToday && (
            <RecordForm key={`${today}-${todayRecord?.id ?? 'new'}`} participationId={mine.id} slotDate={today} fields={fieldsFor(detail, today)}
              numberUnit={s.numberUnit} initial={todayRecord} onSaved={onRecordSaved} />
          )}
          {recording && r && !r.isSlotToday && (
            <div className="cnext">
              {r.nextSlot ? <><strong>다음 기록일 {koShort(r.nextSlot)}</strong><p>오늘은 기록할 차례가 아니에요. 미션은 그대로 이어 가요.</p></> : <strong>남은 기록일이 없어요</strong>}
            </div>
          )}
          {!recording && <p className="cmission-desc">이 캠페인은 기록 없이 함께해요.</p>}
        </section>
        {recording && r && <RecordCalendar detail={detail} data={r} today={today} />}
        <BlockSlotView campaignId={c.id} screen="running" slot="after_common" />
        <BlockSlotView campaignId={c.id} screen="running" slot="bottom" />
        <ParticipantBoard detail={detail} variant="today" reloadKey={boardKey} />
      </div>
      <aside className="cdetail-side">
        {recording && <ProgressCard detail={detail} data={data} showLeft={comeback} />}
        <LatestNotice detail={detail} />
        <HostCard host={c.host} compact />
        <div className="cside-link">
          <button type="button" className="link-quiet" onClick={() => setQuit(true)}>캠페인 그만두기</button>
          {!mine.pauseUsed && <small>그만두기 전에 「쉬어 가기」도 있어요.</small>}
        </div>
      </aside>
      {quit && (
        <PauseQuitModal participationId={mine.id} hostName={c.host.name} hostLinked={c.host.type === 'group'}
          done={r?.progress.done ?? 0} total={r?.progress.total ?? 0} unit={unitOf(detail)} pauseUsed={mine.pauseUsed}
          onClose={() => setQuit(false)} onChanged={refresh} />
      )}
    </div>
  );
}
