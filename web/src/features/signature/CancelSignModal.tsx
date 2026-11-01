import { useState } from 'react';
import { api } from '../../lib/api';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { Button } from '../../components/ui';

/** 서명 취소 확인. 마감 전까지만 열 수 있고, 서버도 마감 뒤 취소는 막는다. */
export function CancelSignModal({ participationId, closeLabel, referred, onClose, onCancelled }: {
  participationId: string; closeLabel: string; referred: number; onClose(): void; onCancelled(): void;
}) {
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/api/participations/${participationId}/cancel`, { method: 'POST', body: {}, quiet: true });
      showToast('서명을 취소했어요');
      onClose();
      onCancelled();
    } catch (e) {
      showToast((e as Error).message || '서명을 취소하지 못했어요');
      setBusy(false);
    }
  };
  return (
    <Modal
      open danger onClose={onClose} title="서명을 취소할까요?" width={480}
      footer={<><Button pill variant="outline" onClick={onClose}>돌아가기</Button><Button pill variant="danger" disabled={busy} onClick={cancel}>서명 취소</Button></>}
    >
      <p>취소하면 서명 수에서 빠지고, 전달 명단에도 들어가지 않아요.</p>
      <p className="sig-note">
        마감({closeLabel}) 전까지는 다시 서명할 수 있어요.{referred > 0 ? ` 내 공유 링크로 들어온 서명 ${referred}건은 그대로 남아요.` : ''}
      </p>
    </Modal>
  );
}
