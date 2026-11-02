import { useEffect, useState } from 'react';
import { koShort } from '@shared/date';
import { api } from '../../lib/api';
import { copyShareLink } from '../../lib/share';
import { useSim } from '../../lib/sim';
import { Button, Chip } from '../../components/ui';
import { useFileUrl } from '../../components/useFileUrl';
import type { CampaignDetail } from '../campaigns/types';
import { useHostJoin } from '../campaigns/useHostJoin';
import { md, n } from './fmt';
import { CountBlock, headerLine, SignLayout, type Aggregate } from './parts';

interface Delivery {
  id: string; summary: string; councils: string[]; photoFileId: string | null; createdAt: string;
  answers: Array<{ id: string; council: string; date: string | null; body: string }>;
}

function DeliveryCard({ detail, delivery, count }: { detail: CampaignDetail; delivery: Delivery; count: number | null }) {
  const sim = useSim();
  const photo = useFileUrl(delivery.photoFileId);
  const date = detail.campaign.schedule.deliveryDate;
  const total = delivery.councils.length;
  const answered = new Set(delivery.answers.map((a) => a.council));
  const pending = Math.max(0, total - answered.size);
  return (
    <section className="card sig-delivery" aria-label="전달 결과">
      <p className="sig-delivery-label">전달 결과{date ? ` · ${koShort(date)}` : ''}</p>
      {total > 0 && <h2>{count != null ? `${n(count)}명의 요구안을 ` : '요구안을 '}{total}개 의회에 전달했어요</h2>}
      <p className="sig-delivery-body">{delivery.summary}</p>
      {delivery.photoFileId && (photo.url
        ? <img className="sig-img" src={photo.url} alt="전달 사진" />
        : <div className="sig-img sig-img-ph" aria-hidden="true" />)}
      <Button variant="outline" onClick={() => { void copyShareLink(detail.campaign.id, sim.userId && sim.role !== 'guest' ? sim.userId : null); }}>전달 결과 공유하기</Button>
      <div className="sig-answers">
        <h3>전달처 답변 {answered.size}{total > 0 ? ` / ${total}` : ''}</h3>
        {delivery.answers.map((a) => (
          <article key={a.id} className="sig-answer">
            <p className="sig-answer-head">{a.council}{a.date ? ` · ${md(a.date)}` : ''}</p>
            <p>{a.body}</p>
          </article>
        ))}
        {total > 0 && pending > 0 && <p className="sig-note">아직 답변이 없는 의회 {pending}곳 · 답변이 오면 알림으로 알려 드려요</p>}
        {delivery.answers.length === 0 && <p className="sig-note">답변이 오면 여기에 덧붙이고 알려 드려요.</p>}
      </div>
    </section>
  );
}

/** S-3 마감 · 전달 결과: 전달 결과 카드가 맨 위, 오른쪽에 다음 서명 알림. */
export function ClosedView({ detail, agg, reload }: { detail: CampaignDetail; agg: Aggregate | null; reload(): Promise<void> }) {
  const sim = useSim();
  const c = detail.campaign;
  const [delivery, setDelivery] = useState<Delivery | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    api<{ delivery: Delivery | null }>(`/api/campaigns/${c.id}/delivery`, { quiet: true })
      .then((r) => alive && setDelivery(r.delivery))
      .catch(() => alive && setDelivery(null));
    return () => { alive = false; };
  }, [c.id]);

  const host = useHostJoin(detail);
  const { hostId, inGroup, pending } = host;

  const lead = delivery
    ? <DeliveryCard detail={detail} delivery={delivery} count={agg?.count ?? null} />
    : delivery === null
      ? (
        <section className="card sig-delivery" aria-label="전달 결과">
          <p className="sig-delivery-label">전달 결과</p>
          <p className="sig-delivery-body">{c.schedule.deliveryDate ? `${md(c.schedule.deliveryDate)}에 전달해요. ` : ''}결과가 올라오면 알림으로 알려 드릴게요.</p>
        </section>
      ) : null;
  const delivered = !!delivery;
  const joined = detail.myParticipation?.state === 'signed';
  const side = (
    <section className="card capply sig-card" aria-label="서명 마감">
      <CountBlock detail={detail} agg={agg} />
      {joined && <p className="sig-done"><strong>{delivered ? '내 서명이 전달됐어요' : '내 서명이 전달 명단에 있어요'}</strong></p>}
      {hostId ? (
        <>
          <p className="capply-note">서명이 마감됐어요. 주최 모임에 가입하면 다음 서명과 후속 활동 소식을 받아 볼 수 있어요.</p>
          {inGroup ? <p className="sig-note">주최 모임에 가입돼 있어요</p>
            : pending ? <p className="sig-note">주최 모임 가입 승인을 기다리고 있어요</p>
              : host.canJoin ? <Button size="lg" block disabled={host.busy} onClick={() => void host.join()}>주최 모임 소식 받기</Button> : null}
        </>
      ) : (
        <p className="capply-note">서명이 마감됐어요. 다음 서명은 홈에서 알려 드려요.</p>
      )}
    </section>
  );
  return (
    <SignLayout
      detail={detail} agg={agg} screen="closed" lead={lead} side={side}
      chip={<Chip tone="gray" square>마감</Chip>}
      line={headerLine(detail, agg, sim.today, true, delivered)}
    />
  );
}
