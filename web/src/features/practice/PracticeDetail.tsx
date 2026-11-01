import { useNavigate } from 'react-router-dom';
import { dDay, diffDays, koShort } from '@shared/date';
import { useSim } from '../../lib/sim';
import { Button, Chip, EmptyState, Spinner } from '../../components/ui';
import { ApplyCard } from '../campaigns/ApplyCard';
import { BlockSlotView } from '../campaigns/BlockSlotView';
import { CampaignHeader, useParticipantTab } from '../campaigns/CampaignHeader';
import { HostCard } from '../campaigns/HostCard';
import { InfoCard } from '../campaigns/InfoCard';
import { MaterialsList } from '../campaigns/MaterialsList';
import { ParticipantBoard } from '../campaigns/ParticipantBoard';
import { phaseFor, runEndOf, STATUS_LABEL, STATUS_TONE, statusFor, type CampaignDetail } from '../campaigns/types';
import { BeforeStart } from './BeforeStart';
import { FinalView } from './FinalView';
import { RecordCalendar, unitOf } from './RecordCalendar';
import { Running } from './Running';
import { CHECK_LABEL } from './types';
import { downloadMyRecords, usePracticeData } from './usePractice';
import './practice.css';

const n = (x: number) => x.toLocaleString('ko-KR');

/** 실천 캠페인: 신청 전 상세(H) 또는 참가자 화면(시작 전 H-2 · 진행 H-3 · 마무리 H-4)과 탭. */
export function PracticeDetail({ detail, reload, completed }: { detail: CampaignDetail; reload(): Promise<void>; completed: boolean }) {
  const mine = detail.myParticipation;
  if (mine && mine.state === 'applied') return <ParticipantView detail={detail} reload={reload} completed={completed} />;
  return <Overview detail={detail} reload={reload} />;
}

/** H 캠페인 상세 (신청 전 · 그만둔 뒤) */
function Overview({ detail, reload }: { detail: CampaignDetail; reload(): Promise<void> }) {
  const sim = useSim();
  const nav = useNavigate();
  const c = detail.campaign;
  const s = c.schedule;
  const st = statusFor(c, sim.today);
  const people = st === 'scheduled' ? `${n(detail.counts.subscribers ?? 0)}명 알림 신청` : `${n(detail.counts.participants)}명 참여`;
  const extra = st === 'recruiting' && s.recruitEnd ? ` · 모집 마감 ${koShort(s.recruitEnd)} · ${dDay(sim.today, s.recruitEnd)}`
    : st === 'scheduled' && s.recruitStart ? ` · 모집 시작 ${koShort(s.recruitStart)}`
      : st === 'running' && s.runStart ? ` · 진행 중 ${diffDays(s.runStart, sim.today) + 1}일째` : '';
  const sp = c.settings.startPoint;
  const promo = sp?.enabled && sp.toolId === 'calculator' && (st === 'recruiting' || st === 'scheduled');
  const reviews = () => {
    if (c.host.type === 'group' && c.host.id) nav(`/groups/${c.host.id}`);
    else document.getElementById('campaign-board')?.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <>
      <CampaignHeader detail={detail} statusChip={<Chip tone={STATUS_TONE[st]} square>{detail.myParticipation?.state === 'quit' ? '그만둠' : STATUS_LABEL[st]}</Chip>} line={`${people}${extra}`} />
      <div className="container page cdetail">
        <div className="cdetail-main">
          <BlockSlotView campaignId={c.id} screen="detail" slot="top" />
          <InfoCard detail={detail} />
          <BlockSlotView campaignId={c.id} screen="detail" slot="after_common" />
          <BlockSlotView campaignId={c.id} screen="detail" slot="bottom" />
          <MaterialsList detail={detail} />
          <div id="campaign-board"><ParticipantBoard detail={detail} variant="preview" /></div>
        </div>
        <aside className="cdetail-side">
          <ApplyCard detail={detail} reload={reload} onReviews={reviews} />
          {promo && (
            <section className="cpromo" aria-label="먼저 해 보기">
              <Chip tone="green" className="cpromo-chip">먼저 해 보기</Chip>
              <h2>신청 전에 출발점을 재 보세요</h2>
              <p>가입 없이 5분이면 돼요. 결과를 저장하면 신청할 때 첫날 기록으로 쓸 수 있어요.</p>
              <Button block variant="outline" onClick={() => nav('/calculator')}>1.5도 계산기 시작하기</Button>
            </section>
          )}
          <HostCard host={c.host} />
        </aside>
      </div>
    </>
  );
}

function ParticipantView({ detail, reload, completed }: { detail: CampaignDetail; reload(): Promise<void>; completed: boolean }) {
  const sim = useSim();
  const [tab] = useParticipantTab();
  const data = usePracticeData(detail);
  const c = detail.campaign;
  const mine = detail.myParticipation!;
  const phase = phaseFor(c, sim.today) ?? 'before';
  const runStart = c.schedule.runStart;
  const refresh = async () => { await Promise.all([reload(), data.reload()]); };

  const chip = phase === 'before' ? <Chip tone="solid" square>참여 신청 완료</Chip>
    : phase === 'running' ? (mine.paused ? <Chip tone="gray" square>쉬어 가는 중</Chip> : <Chip tone="navy" square>참여 중</Chip>)
      : <Chip tone="solid" square>완주</Chip>;
  const when = phase === 'running' && runStart ? ` · ${Math.floor(diffDays(runStart, sim.today) / 7) + 1}주차`
    : phase === 'final' ? ' · 마지막 날' : phase === 'after' ? ' · 끝났어요' : '';
  const meta = `${c.host.name} 주최 · ${n(detail.counts.participants)}명 참여${when}`;

  let body;
  if (tab === 'records') body = <MyRecords detail={detail} data={data} />;
  else if (tab === 'board') body = <div className="cdetail-full"><ParticipantBoard detail={detail} variant="full" /></div>;
  else if (tab === 'info') body = <InfoTab detail={detail} />;
  else if (phase === 'before') body = <BeforeStart detail={detail} data={data} completed={completed} onChanged={refresh} />;
  else if (phase === 'running') body = <Running detail={detail} data={data} onChanged={refresh} />;
  else body = <FinalView detail={detail} data={data} />;

  return (
    <>
      <CampaignHeader detail={detail} statusChip={chip} meta={meta} tabs />
      <div className="container page cpart">{body}</div>
    </>
  );
}

function MyRecords({ detail, data }: { detail: CampaignDetail; data: ReturnType<typeof usePracticeData> }) {
  const sim = useSim();
  const c = detail.campaign;
  if (c.settings.recordEnabled === false) return <EmptyState title="이 캠페인은 기록 없이 함께해요" />;
  const r = data.records;
  if (!r) return <Spinner />;
  const unit = unitOf(detail);
  const end = runEndOf(c);
  return (
    <div className="cdetail-full myrec">
      <RecordCalendar detail={detail} data={r} today={sim.today} />
      <section className="card myrec-list" aria-label="기록 목록">
        <div className="cboard-head">
          <h2>내 기록 {r.progress.done} / {r.progress.total}{unit}</h2>
          <Button variant="outline" onClick={() => downloadMyRecords(detail, r)}>내 기록 내려받기</Button>
        </div>
        {r.records.length === 0 && <EmptyState title="아직 기록이 없어요">{end && sim.today <= end ? '기록할 차례가 되면 오늘 탭에서 기록해요.' : ''}</EmptyState>}
        {r.records.length > 0 && (
          <ul className="myrec-rows">
            {[...r.records].reverse().map((x) => {
              const m = detail.missions.find((mm) => mm.id === x.missionId);
              return (
                <li key={x.id}>
                  <span className="myrec-date">{koShort(x.slotDate)}</span>
                  <Chip tone={x.check === 'none' ? 'red' : 'green'}>{CHECK_LABEL[x.check]}</Chip>
                  <span className="myrec-text">{m?.title ?? '실천 기록'}{x.memo ? ` · ${x.memo}` : ''}{x.number != null ? ` · ${x.number}${c.settings.numberUnit ?? ''}` : ''}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function InfoTab({ detail }: { detail: CampaignDetail }) {
  const c = detail.campaign;
  return (
    <div className="cdetail">
      <div className="cdetail-main">
        {c.summary && <p className="cinfo-summary">{c.summary}</p>}
        <InfoCard detail={detail} />
        {detail.missions.length > 0 && (
          <section aria-label="미션">
            <h2 className="csec-title">미션</h2>
            <ul className="card cmissions">
              {detail.missions.map((m) => (
                <li key={m.id}>
                  <span className="cmissions-round">{m.date ? koShort(m.date) : m.round ? (c.settings.missionCycle === 'weekly' ? `${m.round}주차` : c.settings.missionCycle === 'daily' ? `${m.round}일째` : '') : ''}</span>
                  {m.category && <Chip tone="green">{m.category}</Chip>}
                  <span>{m.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <MaterialsList detail={detail} />
      </div>
      <aside className="cdetail-side"><HostCard host={c.host} compact /></aside>
    </div>
  );
}
