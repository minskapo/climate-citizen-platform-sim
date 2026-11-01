import { useState } from 'react';
import { api } from '../lib/api';
import { Modal } from './Modal';
import { showToast } from './Toast';
import { Button } from './ui';

/** 신고 창. 글 · 댓글 · 모임을 신고한다. */
export function ReportModal({ targetType, targetId, onClose }: { targetType: 'post' | 'comment' | 'group'; targetId: string; onClose(): void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!reason.trim()) { setError('신고 사유를 써 주세요'); return; }
    setBusy(true);
    try {
      await api('/api/reports', { body: { targetType, targetId, reason: reason.trim() }, quiet: true });
      showToast('신고했어요 · 관리자가 확인해요');
      onClose();
    } catch (e) {
      setError((e as Error).message || '신고하지 못했어요');
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="신고하기" description="운영 원칙에 어긋난다고 생각하면 알려 주세요. 관리자가 확인해요."
      footer={<><Button variant="ghost" pill onClick={onClose}>취소</Button><Button pill disabled={busy} onClick={() => void send()}>신고하기</Button></>}>
      <label className="field">
        <span className="field-label">신고 사유</span>
        <textarea className="input" rows={4} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <span className="field-error" role="alert">{error}</span>}
      </label>
    </Modal>
  );
}
