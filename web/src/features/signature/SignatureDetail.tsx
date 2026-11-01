import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { koShort } from '@shared/date';
import { useSim } from '../../lib/sim';
import { Button, Chip } from '../../components/ui';
import { ApplySheet } from '../campaigns/ApplySheet';
import { useSubscribe } from '../campaigns/ApplyCard';
import { STATUS_LABEL, STATUS_TONE, statusFor, type CampaignDetail } from '../campaigns/types';
import { ClosedView } from './ClosedView';
import { CountBlock, headerLine, ShareButton, SignLayout, useAggregate } from './parts';
import { SignedView } from './SignedView';

/** 서명 캠페인: 모집 중 상세(S) · 서명 완료(S-2) · 마감과 전달 결과(S-3). 서명 창(S-1)은 공통 ApplySheet. */
export function SignatureDetail({ detail, reload }: { detail: CampaignDetail; reload(): Promise<void> }) {
  const sim = useSim();
  const [sp] = useSearchParams();
  const c = detail.campaign;
  const st = statusFor(c, sim.today);
  const mine = detail.myParticipation;
  const signed = mine?.state === 'signed';
  const agg = useAggregate(c.id, `${mine?.state}:${sim.today}:${sim.userId}`);

  if (st === 'closed') return <ClosedView detail={detail} agg={agg} reload={reload} />;
  if (signed) return <SignedView detail={detail} agg={agg} reload={reload} />;
  return <OpenView detail={detail} agg={agg} reload={reload} sharedBy={sp.get('ref')} />;
}

function OpenView({ detail, agg, reload, sharedBy }: { detail: CampaignDetail; agg: ReturnType<typeof useAggregate>; reload(): Promise<void>; sharedBy: string | null }) {
  const sim = useSim();
  const [signing, setSigning] = useState(false);
  const sub = useSubscribe(detail, reload);
  const c = detail.campaign;
  const st = statusFor(c, sim.today);
  const scheduled = st === 'scheduled';
  const sch = c.schedule;
  const side = (
    <section className="card capply sig-card" aria-label="서명">
      {scheduled ? (
        <>
          <p className="capply-count"><strong>{(detail.counts.subscribers ?? 0).toLocaleString('ko-KR')}</strong>명 알림 신청</p>
          {sch.recruitStart && <p className="capply-line">서명 시작 {koShort(sch.recruitStart)}</p>}
        </>
      ) : <CountBlock detail={detail} agg={agg} lead={sch.recruitEnd ? <p className="capply-line">{headerLine(detail, agg, sim.today, false, false).split(' · ').slice(-2).join(' · ')}</p> : null} />}
      <div className="sig-cta">
        {scheduled
          ? <Button size="lg" block variant={sub.subscribed ? 'tint' : 'primary'} disabled={sub.busy} onClick={sub.toggle} aria-pressed={sub.subscribed}>{sub.subscribed ? '✓ 알림 신청됨 · 취소하기' : '알림 받기'}</Button>
          : <Button size="lg" block onClick={() => setSigning(true)}>서명하기</Button>}
      </div>
      {!scheduled && <p className="capply-note">서명하면 활동명과 사는 지역이 요구안과 함께 전달처로 넘어가요. 회원 가입이 필요해요.</p>}
      <ShareButton detail={detail} />
      {signing && <ApplySheet campaignId={c.id} origin="elsewhere" sharedBy={sharedBy} onClose={() => setSigning(false)} onDone={() => { void reload(); }} />}
    </section>
  );
  return (
    <SignLayout
      detail={detail} agg={agg} screen="detail" side={side}
      chip={<Chip tone={STATUS_TONE[st]} square>{STATUS_LABEL[st]}</Chip>}
      line={headerLine(detail, agg, sim.today, false, false)}
    />
  );
}
