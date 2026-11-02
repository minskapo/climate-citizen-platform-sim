import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSim } from '../../lib/sim';
import { Button } from '../../components/ui';
import { BlockSlotView } from '../campaigns/BlockSlotView';
import { HostCard } from '../campaigns/HostCard';
import { ParticipantBoard, postPath, useBoardPosts } from '../campaigns/ParticipantBoard';
import type { CampaignDetail } from '../campaigns/types';
import { AttendSheet } from './AttendSheet';
import { atTime, attendanceGate, fromMin, offlineOf, toMin, type Attendance } from './util';

function untilText(start: string | null | undefined, end: string | null | undefined, now: string) {
  if (!start) return { label: '오늘', value: '' };
  const d = toMin(start) - toMin(now);
  if (d > 0) return { label: '시작까지', value: d >= 60 ? `${Math.floor(d / 60)}시간${d % 60 ? ` ${d % 60}분` : ''}` : `${d}분` };
  if (end && toMin(now) > toMin(end)) return { label: '모임이', value: '끝났어요' };
  return { label: '모임이', value: '진행 중' };
}

/** O-3 모임 당일: 현장 QR 출석 · 운영진 공지 · 참가자 게시판 */
export function EventDay({ detail, attendance, onChanged }: { detail: CampaignDetail; attendance: Attendance | null; onChanged(time?: string): Promise<void> | void }) {
  const sim = useSim();
  const c = detail.campaign;
  const s = c.schedule;
  const o = offlineOf(detail);
  const [sheet, setSheet] = useState(false);
  const gate = attendanceGate(s, sim.today, sim.nowTime);
  const until = untilText(s.eventStart, s.eventEnd, sim.nowTime);
  const notices = useBoardPosts(c.id, { enabled: true, category: '공지' });
  const latest = notices.items?.[0];

  return (
    <div className="cdetail">
      <div className="cdetail-main">
        <section className="cbanner" aria-label="모임 당일">
          <div>
            <h2>오늘 {s.eventStart}, {c.title}이에요</h2>
            <p>{o.place.exact || o.place.public}{o.attendance === 'qr' && s.eventStart ? ` · 도착하면 운영진이 들고 있는 QR을 찍어 출석해 주세요. QR은 ${fromMin(toMin(s.eventStart) - 60)}부터 열려 있어요.` : ''}</p>
          </div>
          <div className="cbanner-dday"><small>{until.label}</small><strong>{until.value}</strong></div>
        </section>
        <BlockSlotView campaignId={c.id} screen="event" slot="top" />
        {o.attendance !== 'none' && (
          <section className="card coff-attend" aria-label="현장 출석">
            <div className="cchk-head"><h2>현장 QR 출석</h2></div>
            {detail.counts.attendedCount != null && (
              <p className="coff-sub" role="status">지금 출석 {detail.counts.attendedCount.toLocaleString('ko-KR')} / {detail.counts.seatsTaken.toLocaleString('ko-KR')}명</p>
            )}
            {attendance ? (
              <p className="coff-attended"><strong>✓ 출석했어요 · {atTime(attendance.at)}</strong> 「참여 완료」로 기록됐고, 내 활동에 남아요.</p>
            ) : o.attendance === 'qr' ? (
              <>
                <p className="coff-sub">카메라가 열리면 운영진이 들고 있는 QR을 비춰 주세요. 출석하면 「참여 완료」로 기록되고, 내 활동에 남아요.</p>
                <Button size="lg" block onClick={() => setSheet(true)}>QR 찍고 출석하기</Button>
                {!gate.open && <p className="coff-closed" role="status">{gate.message}</p>}
                <p className="coff-sub">카메라를 쓸 수 없으면 운영진에게 활동명을 말해 주세요. 운영진이 명단에서 출석을 체크해요.</p>
              </>
            ) : (
              <p className="coff-sub">도착하면 운영진에게 활동명을 말해 주세요. 운영진이 명단에서 출석을 체크해요.</p>
            )}
          </section>
        )}
        {latest && (
          <section className="card coff-notice-card" aria-label="운영진 공지">
            <p className="chost-label">운영진 공지</p>
            <Link to={postPath(c.id, latest.id)}><strong>{latest.title}</strong></Link>
            <p className="coff-sub">{latest.author}</p>
          </section>
        )}
        <BlockSlotView campaignId={c.id} screen="event" slot="after_common" />
        <BlockSlotView campaignId={c.id} screen="event" slot="bottom" />
        <ParticipantBoard detail={detail} variant="compact" />
      </div>
      <aside className="cdetail-side"><HostCard host={c.host} compact /></aside>
      {sheet && <AttendSheet detail={detail} onClose={() => setSheet(false)} onAttended={(t) => { setSheet(false); void onChanged(t); }} />}
    </div>
  );
}
