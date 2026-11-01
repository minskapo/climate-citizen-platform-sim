import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { dDay, diffDays, koShort } from '@shared/date';
import { api } from '../../lib/api';
import { share } from '../../lib/share';
import { useSim } from '../../lib/sim';
import { showToast } from '../../components/Toast';
import { Button } from '../../components/ui';
import { ApplySheet } from './ApplySheet';
import { statusFor, type CampaignDetail } from './types';

const n = (x: number) => x.toLocaleString('ko-KR');
const md = (d: string) => koShort(d).replace(/\(.\)$/, '');

/** 알림 받기(모집 예정 · 다음 기수) 구독 토글 */
export function useSubscribe(detail: CampaignDetail, reload: () => Promise<void>) {
  const sim = useSim();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (!sim.userId || sim.role === 'guest') { showToast('가입하면 알림을 받을 수 있어요'); nav('/signup'); return; }
    setBusy(true);
    try {
      if (detail.subscribed) {
        await api(`/api/campaigns/${detail.campaign.id}/subscribe`, { method: 'DELETE', quiet: true });
        showToast('알림 신청을 취소했어요');
      } else {
        await api(`/api/campaigns/${detail.campaign.id}/subscribe`, { method: 'POST', quiet: true });
        showToast('알림을 신청했어요');
      }
      await reload();
    } catch (e) {
      showToast((e as Error).message || '알림을 신청하지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  return { subscribed: !!detail.subscribed, busy, toggle };
}

/** 상태별 주 버튼과 인원 표시 (Note: 상태별 주 버튼). 신청하지 않은 사람에게 보이는 오른쪽 카드. */
export function ApplyCard({ detail, reload, onReviews }: { detail: CampaignDetail; reload(): Promise<void>; onReviews?(): void }) {
  const sim = useSim();
  const c = detail.campaign;
  const s = c.schedule;
  const st = statusFor(c, sim.today);
  const [applying, setApplying] = useState(false);
  const sub = useSubscribe(detail, reload);
  const mine = detail.myParticipation;
  const quit = mine?.state === 'quit';
  const participants = detail.counts.participants;
  const full = detail.counts.seatsLeft === 0 && c.type !== 'signature';
  const verb = c.type === 'signature' ? '서명' : '참여';

  let big: { num: number; unit: string };
  let line = '';
  let main: ReactNode;
  let note: string | null = null;
  let second: ReactNode = null;

  if (st === 'scheduled') {
    big = { num: detail.counts.subscribers ?? 0, unit: '명 알림 신청' };
    line = s.recruitStart ? `모집 시작 ${koShort(s.recruitStart)}${s.recruitStartTime && s.recruitStartTime !== '00:00' ? ` ${s.recruitStartTime}` : ''} · ${dDay(sim.today, s.recruitStart)}` : '';
    main = sub.subscribed
      ? <Button size="lg" block variant="tint" disabled={sub.busy} onClick={sub.toggle} aria-pressed="true">✓ 알림 신청됨 · 취소하기</Button>
      : <Button size="lg" block disabled={sub.busy} onClick={sub.toggle}>알림 받기</Button>;
    note = '모집이 시작되면 알림함으로 알려 드려요.';
  } else if (st === 'recruiting' && !quit) {
    big = { num: participants, unit: `명 ${verb}` };
    if (s.recruitEnd) line = `모집 마감까지 ${dDay(sim.today, s.recruitEnd)} · ${koShort(s.recruitEnd)}`;
    main = full
      ? <Button size="lg" block disabled>자리가 모두 찼어요</Button>
      : <Button size="lg" block onClick={() => setApplying(true)}>{c.type === 'signature' ? '서명하기' : '참여 신청하기'}</Button>;
    if (c.type === 'practice') {
      const start = s.runStart ? `${md(s.runStart)}부터 ` : '';
      const remind = c.settings.recordEnabled === false ? '' : `${start}${c.settings.recordCycle === 'daily' ? '매일 ' : '기록할 날 '}저녁 미션 알림을 받아요. `;
      note = c.host.type === 'group'
        ? `신청하면 주최 모임 「${c.host.name}」에 가입되고, ${remind}회원 가입이 필요해요.`
        : `${remind}회원 가입이 필요해요.`;
    }
  } else if (st === 'closed') {
    big = { num: participants, unit: `명 ${verb}` };
    line = '마감된 캠페인이에요';
    main = <Button size="lg" block variant="outline" onClick={onReviews}>후기 보기</Button>;
  } else {
    // 진행 중 · 비참가자, 또는 이번 기수를 그만둔 사람
    big = { num: participants, unit: `명 ${verb}` };
    if (st === 'running' && s.runStart) line = `진행 중 · ${diffDays(s.runStart, sim.today) + 1}일째`;
    main = <Button size="lg" block disabled>{quit ? '이번 기수에는 다시 참여할 수 없어요' : '모집이 끝났어요'}</Button>;
    second = sub.subscribed
      ? <Button block variant="tint" disabled={sub.busy} onClick={sub.toggle} aria-pressed="true">✓ 다음 기수 알림 신청됨</Button>
      : <Button block variant="outline" disabled={sub.busy} onClick={sub.toggle}>다음 기수 알림 받기</Button>;
  }

  return (
    <section className="card capply" aria-label="참여">
      <p className="capply-count"><strong>{n(big.num)}</strong> {big.unit}</p>
      {line && <p className="capply-line">{line}</p>}
      <div className="capply-main">{main}</div>
      {note && <p className="capply-note">{note}</p>}
      {second}
      <Button block variant="outline" onClick={() => share(`/campaigns/${c.id}`, c.title)}>공유하기</Button>
      {applying && <ApplySheet campaignId={c.id} origin="detail" onClose={() => setApplying(false)} onDone={() => { void reload(); }} />}
    </section>
  );
}
