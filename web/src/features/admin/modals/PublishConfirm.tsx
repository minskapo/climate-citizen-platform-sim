import { useEffect, useState } from 'react';
import { addDays, koShort } from '@shared/date';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/ui';
import { api } from '../../../lib/api';
import { IGT_NAME } from '../../campaigns/types';
import { koDateTime, md, type EditorDraft } from '../editor/model';

/** 공개를 예약할까요? — 예약 시각 · 일정 · 주최 · 공개 전 · 홈 히어로를 확인한다. */
export function PublishConfirm({ draft, campaignId, busy, onClose, onConfirm }: {
  draft: EditorDraft; campaignId: string | null; busy: boolean; onClose(): void; onConfirm(): void;
}) {
  const s = draft.schedule;
  const [hero, setHero] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!draft.settings.heroEnabled) return;
    api<{ items: Array<{ id: string; title: string }> }>('/api/campaigns?hero=1', { quiet: true })
      .then((r) => setHero(r.items?.find((c) => c.id !== campaignId) ?? null))
      .catch(() => setHero(null));
  }, [draft.settings.heroEnabled, campaignId]);

  const start = koDateTime(s.recruitStart, s.recruitStartTime ?? '00:00');
  const rows: Array<[string, string]> = [[draft.type === 'signature' ? '서명 시작' : '모집 시작', start]];
  if (draft.type === 'practice' && s.runStart && s.runDays) rows.push(['진행', `${koShort(s.runStart)}–${koShort(addDays(s.runStart, s.runDays - 1))} · ${s.runDays}일`]);
  if (draft.type === 'offline' && s.eventDate) rows.push(['모임', `${koShort(s.eventDate)} ${s.eventStart ?? ''}${s.eventEnd ? `–${s.eventEnd}` : ''}`.trim()]);
  if (draft.type === 'signature' && s.recruitEnd) rows.push(['서명 마감', koDateTime(s.recruitEnd, s.recruitEndTime)]);
  rows.push(['주최 모임', draft.hostName ?? IGT_NAME]);
  rows.push(['공개 전', draft.showUpcoming ? '목록에 「모집 예정」으로 보이고 알림 신청을 받아요' : '목록에 보이지 않아요']);
  rows.push(['홈 히어로', draft.settings.heroEnabled ? '모집 시작과 함께 걸려요' : '걸지 않아요']);

  return (
    <Modal
      open onClose={onClose} title="공개를 예약할까요?" description="예약한 시각에 캠페인이 열리고 모집이 시작돼요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button disabled={busy} onClick={onConfirm}>공개 예약하기</Button></>}
    >
      <dl className="ed-confirm">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {hero && s.recruitStart && (
        <p className="callout-warn ed-confirm-note">
          지금 홈 히어로에 걸린 「{hero.title}」은 {md(s.recruitStart)} {s.recruitStartTime ?? '00:00'}에 내려가요.
        </p>
      )}
    </Modal>
  );
}
