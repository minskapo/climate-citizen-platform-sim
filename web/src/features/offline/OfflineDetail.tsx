import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { dDay, koLong, koShort } from '@shared/date';
import { api } from '../../lib/api';
import { share } from '../../lib/share';
import { useSim } from '../../lib/sim';
import { showToast } from '../../components/Toast';
import { Button, Chip } from '../../components/ui';
import { ApplyCard } from '../campaigns/ApplyCard';
import { BlockSlotView } from '../campaigns/BlockSlotView';
import { CampaignHeader, useParticipantTab, type ParticipantTab } from '../campaigns/CampaignHeader';
import { HostCard } from '../campaigns/HostCard';
import { MaterialsList } from '../campaigns/MaterialsList';
import { ParticipantBoard } from '../campaigns/ParticipantBoard';
import { STATUS_LABEL, STATUS_TONE, statusFor, type CampaignDetail } from '../campaigns/types';
import { AfterEvent } from './AfterEvent';
import { AttendedModal } from './AttendSheet';
import { BeforeEvent } from './BeforeEvent';
import { EventDay } from './EventDay';
import { canCancelNow, offlineOf, toMin, useAttendance } from './util';
import './offline.css';

const n = (x: number) => x.toLocaleString('ko-KR');
const TABS: Array<[ParticipantTab, string]> = [['today', '모임 안내'], ['board', '참가자 게시판'], ['info', '캠페인 안내']];

/** 일시 · 장소 · 정원 · 준비물 (O 상세와 캠페인 안내 탭이 함께 쓴다) */
export function EventInfo({ detail, exact }: { detail: CampaignDetail; exact?: boolean }) {
  const sim = useSim();
  const s = detail.campaign.schedule;
  const o = offlineOf(detail);
  const c = detail.counts;
  const minutes = s.eventStart && s.eventEnd ? toMin(s.eventEnd) - toMin(s.eventStart) : 0;
  const len = minutes > 0 ? ` (${minutes % 60 === 0 ? `${minutes / 60}시간` : `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}시간 ` : ''}${minutes % 60}분`})` : '';
  const rows: Array<[string, string]> = [];
  if (s.eventDate) rows.push(['일시', `${koLong(s.eventDate)}${s.eventStart ? ` ${s.eventStart}` : ''}${s.eventEnd ? ` – ${s.eventEnd}` : ''}${len}`]);
  rows.push(['장소', exact && o.place.exact ? o.place.exact : `${o.place.public || '장소는 곧 알려 드려요'}${o.place.public ? ' (정확한 위치는 신청하면 알려 드려요)' : ''}`]);
  if (o.capacity) rows.push(['정원', `${n(o.capacity)}명${o.waitlist ? ' · 자리가 다 차면 대기 신청을 받아요' : ''}`]);
  if (s.recruitEnd) rows.push(['모집 마감', `${koShort(s.recruitEnd)}${s.recruitEndTime ? ` ${s.recruitEndTime}` : ''} · ${dDay(sim.today, s.recruitEnd)}`]);
  if (o.supplies) rows.push(['준비물', o.supplies]);
  return (
    <section className="card cinfo" aria-label="모임 안내">
      <dl>
        {rows.map(([k, v]) => <div key={k} className="cinfo-row"><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {c.capacity != null && <p className="coff-seats">{n(c.seatsTaken)} / {n(c.capacity)}명 신청 · 남은 자리 {n(c.seatsLeft ?? 0)}</p>}
    </section>
  );
}

function MapPlaceholder({ detail, exact }: { detail: CampaignDetail; exact?: boolean }) {
  const o = offlineOf(detail);
  const where = exact && o.place.exact ? o.place.exact : o.place.public;
  return (
    <section className="card coff-map" aria-label="장소">
      <p className="chost-label">장소</p>
      <div className="coff-map-box" aria-hidden="true">지도</div>
      <p>{where ? (exact && o.place.exact ? where : `${where} 일대 (신청하면 정확한 위치가 보여요)`) : '장소는 곧 알려 드려요'}</p>
    </section>
  );
}

/** 오프라인 모임: 신청 전 상세(O) · 모임 전(O-2) · 당일(O-3) · 끝난 뒤(O-4). 신청 창(O-1)은 공통 ApplySheet. */
export function OfflineDetail({ detail, reload, completed, attended, notice }: {
  detail: CampaignDetail; reload(): Promise<void>; completed: boolean; attended: string | null; notice: string | null;
}) {
  const mine = detail.myParticipation;
  const nav = useNavigate();
  const loc = useLocation();
  const [attendedAt, setAttendedAt] = useState<string | null>(attended);
  const [noticeText, setNoticeText] = useState<string | null>(notice);
  const dismiss = () => {
    setAttendedAt(null);
    nav(loc.pathname + loc.search, { replace: true, state: {} });
  };
  const banner = noticeText && (
    <div className="container"><p className="coff-notice" role="status">{noticeText}<button type="button" className="link-btn" onClick={() => setNoticeText(null)}>닫기</button></p></div>
  );
  const modal = attendedAt && <AttendedModal detail={detail} time={attendedAt} onClose={dismiss} />;

  if (mine?.state === 'applied') {
    return <>{banner}<ParticipantView detail={detail} reload={reload} completed={completed} onAttended={setAttendedAt} />{modal}</>;
  }
  return <>{banner}<Overview detail={detail} reload={reload} />{modal}</>;
}

/** O 모집 중 상세 (신청 전 · 대기 중 · 취소한 뒤) */
function Overview({ detail, reload }: { detail: CampaignDetail; reload(): Promise<void> }) {
  const sim = useSim();
  const nav = useNavigate();
  const c = detail.campaign;
  const s = c.schedule;
  const st = statusFor(c, sim.today);
  const mine = detail.myParticipation;
  const waiting = mine?.state === 'waitlisted';
  const cnt = detail.counts;
  const extra = st === 'recruiting' && s.recruitEnd ? ` · 모집 마감 ${koShort(s.recruitEnd)}${s.recruitEndTime ? ` ${s.recruitEndTime}` : ''} · ${dDay(sim.today, s.recruitEnd)}` : '';
  const people = st === 'scheduled' ? `${n(detail.counts.subscribers ?? 0)}명 알림 신청`
    : cnt.capacity != null ? `${n(cnt.seatsTaken)} / ${n(cnt.capacity)}명 신청 · 남은 자리 ${n(cnt.seatsLeft ?? 0)}` : `${n(cnt.participants)}명 신청`;
  const reviews = () => {
    if (c.host.type === 'group' && c.host.id) nav(`/groups/${c.host.id}`);
    else document.getElementById('campaign-board')?.scrollIntoView({ behavior: 'smooth' });
  };
  const [busy, setBusy] = useState(false);
  const cancelWait = async () => {
    setBusy(true);
    try {
      await api(`/api/participations/${mine!.id}/cancel`, { method: 'POST', body: {}, quiet: true });
      showToast('대기 신청을 취소했어요');
      await reload();
    } catch (e) {
      showToast((e as Error).message || '취소하지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <CampaignHeader detail={detail} statusChip={<Chip tone={waiting ? 'yellow' : STATUS_TONE[st]} square>{waiting ? `대기 ${mine!.waitlistNo ?? ''}번` : STATUS_LABEL[st]}</Chip>} line={`${people}${extra}`} />
      <div className="container page cdetail">
        <div className="cdetail-main">
          <BlockSlotView campaignId={c.id} screen="detail" slot="top" />
          <EventInfo detail={detail} />
          <BlockSlotView campaignId={c.id} screen="detail" slot="after_common" />
          <MapPlaceholder detail={detail} />
          <BlockSlotView campaignId={c.id} screen="detail" slot="bottom" />
          <MaterialsList detail={detail} />
          <div id="campaign-board"><ParticipantBoard detail={detail} variant="preview" /></div>
        </div>
        <aside className="cdetail-side">
          {waiting ? (
            <section className="card capply" aria-label="대기 신청">
              <p className="capply-count"><strong>대기 {mine!.waitlistNo}번</strong></p>
              <p className="capply-note">자리가 나면 순서대로 자동으로 확정하고 알려 드려요.</p>
              {canCancelNow(s, sim.today, sim.nowTime) && <Button block variant="outline" disabled={busy} onClick={cancelWait}>대기 신청 취소하기</Button>}
              <Button block variant="outline" onClick={() => share(`/campaigns/${c.id}`, c.title)}>공유하기</Button>
            </section>
          ) : <ApplyCard detail={detail} reload={reload} onReviews={reviews} />}
          <HostCard host={c.host} />
        </aside>
      </div>
    </>
  );
}

function ParticipantView({ detail, reload, completed, onAttended }: { detail: CampaignDetail; reload(): Promise<void>; completed: boolean; onAttended(time: string): void }) {
  const sim = useSim();
  const [tab] = useParticipantTab();
  const c = detail.campaign;
  const s = c.schedule;
  const mine = detail.myParticipation!;
  const phase: 'before' | 'day' | 'after' = !s.eventDate || sim.today < s.eventDate ? 'before' : sim.today === s.eventDate ? 'day' : 'after';
  const { attendance, reload: reloadAttendance } = useAttendance(mine.id, phase !== 'before', `${sim.today}:${sim.userId}`);
  const attended = !!attendance;
  const [boardKey, setBoardKey] = useState(0);

  const chip = phase === 'before' ? <Chip tone="solid" square>신청 완료</Chip>
    : attended ? <Chip tone="solid" square>참여 완료</Chip>
      : phase === 'day' ? <Chip tone="navy" square>오늘</Chip> : <Chip tone="gray" square>모임이 끝났어요</Chip>;
  const meta = `${c.host.name} 주최 · ${n(detail.counts.participants)}명 신청`;
  const done = async (time?: string) => { await Promise.all([reload(), reloadAttendance()]); if (time) onAttended(time); };

  let body;
  if (tab === 'board') body = <div className="cdetail-full"><ParticipantBoard detail={detail} variant="full" reloadKey={boardKey} /></div>;
  else if (tab === 'info') {
    body = (
      <div className="cdetail">
        <div className="cdetail-main">
          {c.summary && <p className="cinfo-summary">{c.summary}</p>}
          <EventInfo detail={detail} exact />
          <MaterialsList detail={detail} />
        </div>
        <aside className="cdetail-side"><HostCard host={c.host} compact /></aside>
      </div>
    );
  } else if (phase === 'before') body = <BeforeEvent detail={detail} completed={completed} onChanged={reload} onPosted={() => setBoardKey((k) => k + 1)} />;
  else if (phase === 'day') body = <EventDay detail={detail} attendance={attendance ?? null} onChanged={done} />;
  else body = <AfterEvent detail={detail} attendance={attendance ?? null} onPosted={() => setBoardKey((k) => k + 1)} />;

  return (
    <>
      <CampaignHeader detail={detail} statusChip={chip} meta={meta} tabs tabItems={TABS} />
      <div className="container page cpart">{body}</div>
    </>
  );
}

