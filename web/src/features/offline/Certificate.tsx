import { koLong } from '@shared/date';
import { useSim } from '../../lib/sim';
import { useParams } from 'react-router-dom';
import { showToast } from '../../components/Toast';
import { Button, EmptyState, Spinner } from '../../components/ui';
import { useCampaignDetail } from '../campaigns/CampaignDetailPage';
import { atTime, offlineOf, useAttendance } from './util';
import './offline.css';

/** /campaigns/:id/certificate — 참여 확인서(인쇄용 화면). 출석한 사람만 받을 수 있어요. */
export function Certificate() {
  const { id = '' } = useParams();
  const sim = useSim();
  const { detail, error } = useCampaignDetail(id);
  const mine = detail?.myParticipation;
  const { attendance } = useAttendance(mine?.id, !!mine && mine.state === 'applied', `${sim.userId}`);

  if (error) return <div className="container page"><EmptyState title={error} /></div>;
  if (!detail || attendance === undefined) return <div className="container page"><Spinner /></div>;
  if (!attendance) {
    return <div className="container page"><EmptyState title="참여 확인서는 출석한 사람에게만 드려요">출석 기록이 없어요. 출석이 빠졌다면 운영진에게 알려 주세요.</EmptyState></div>;
  }
  const c = detail.campaign;
  const s = c.schedule;
  const o = offlineOf(detail);
  const print = () => { window.print(); showToast('참여 확인서를 내려받았어요 (PDF)'); };
  return (
    <div className="container page">
      <div className="coff-cert-bar no-print">
        <h1 className="page-title">참여 확인서</h1>
        <Button onClick={print}>인쇄하기 · PDF로 저장</Button>
      </div>
      <article className="coff-cert" aria-label="참여 확인서">
        <p className="coff-cert-org">기후시민플랫폼</p>
        <h2>참여 확인서</h2>
        <dl>
          <div><dt>참여자</dt><dd>{sim.nickname ?? '참여자'}</dd></div>
          <div><dt>모임</dt><dd>{c.title}</dd></div>
          <div><dt>일시</dt><dd>{s.eventDate ? koLong(s.eventDate) : ''}{s.eventStart ? ` ${s.eventStart}` : ''}{s.eventEnd ? ` – ${s.eventEnd}` : ''}</dd></div>
          {o.place.public && <div><dt>장소</dt><dd>{o.place.public}</dd></div>}
          <div><dt>출석</dt><dd>{atTime(attendance.at)} 출석 확인</dd></div>
          <div><dt>주최</dt><dd>{c.host.name}</dd></div>
        </dl>
        <p className="coff-cert-text">위 사람이 위 모임에 참여했음을 확인합니다.</p>
        <p className="coff-cert-date">{koLong(sim.today)}</p>
        <p className="coff-cert-org">녹색전환연구소 기후시민팀</p>
      </article>
    </div>
  );
}
