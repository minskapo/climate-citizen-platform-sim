import { useState } from 'react';
import { api } from '../../lib/api';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { Button } from '../../components/ui';

const REASONS = ['시간을 내기 어려워요', '미션이 생활과 잘 맞지 않아요', '개인 사정이 생겼어요', '기타'];

/** 그만두기(H-3b): 그만두기 전에 일주일 쉬어 가기를 먼저 권한다. */
export function PauseQuitModal({ participationId, hostName, hostLinked, done, total, unit, pauseUsed, onClose, onChanged }: {
  participationId: string; hostName: string; hostLinked: boolean; done: number; total: number; unit: string; pauseUsed: boolean;
  onClose(): void; onChanged(): void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (path: 'pause' | 'quit') => {
    setBusy(true);
    try {
      await api(`/api/participations/${participationId}/${path}`, { method: 'POST', body: path === 'quit' ? { reason } : {}, quiet: true });
      showToast(path === 'quit' ? '캠페인을 그만뒀어요. 기록은 그대로 남아요' : '일주일 쉬어 가요. 그동안 미션 알림이 오지 않아요');
      onClose();
      onChanged();
    } catch (e) {
      showToast((e as Error).message || '처리하지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open danger onClose={onClose} title="캠페인을 그만둘까요?" width={560}
      footer={<>
        <Button pill size="lg" onClick={onClose}>계속 참여하기</Button>
        <Button pill size="lg" variant="outline" className="btn-danger-text" disabled={busy} onClick={() => run('quit')}>그만두기</Button>
      </>}
    >
      {!pauseUsed && (
        <div className="pq-pause">
          <strong>그만두는 대신 일주일 쉬어 갈 수도 있어요</strong>
          <p>쉬는 동안에는 미션 알림이 오지 않고, 기록하지 않은 날도 「쉬어 감」으로 표시돼요.</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => run('pause')}>일주일 쉬어 가기</Button>
        </div>
      )}
      <fieldset className="pq-reasons">
        <legend>그만두는 이유를 알려 주세요 (선택)</legend>
        {REASONS.map((r) => (
          <label key={r}><input type="radio" name="quit-reason" checked={reason === r} onChange={() => setReason(r)} /> {r}</label>
        ))}
        <p className="field-hint">답해 주시면 다음 기수 미션을 다듬는 데에만 써요.</p>
      </fieldset>
      <div className="pq-info">
        <strong>그만두면</strong>
        <ul>
          <li>지금까지의 기록({done} / {total}{unit})은 「내 활동 › 지난 캠페인」에 남아요.</li>
          <li>이번 기수에는 다시 참여할 수 없고, 다음 기수 알림은 받을 수 있어요.</li>
          {hostLinked && <li>주최 모임 「{hostName}」에는 그대로 남아요. 탈퇴는 모임에서 따로 해요.</li>}
        </ul>
      </div>
    </Modal>
  );
}
