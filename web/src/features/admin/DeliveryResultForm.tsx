import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';

/** 의회 답변 기록: 전달 결과를 올린 뒤 의회마다 받은 답변을 남긴다. */
export function DeliveryResultForm({ campaignId, councils, onClose }: { campaignId: string; councils: string[]; onClose(): void }) {
  const [council, setCouncil] = useState(councils[0] ?? '');
  const [date, setDate] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!council.trim() || !date || !body.trim()) { setErr('전달처 · 답변 날짜 · 답변 내용을 모두 적어 주세요'); return; }
    setBusy(true);
    try {
      await api(`/api/campaigns/${campaignId}/delivery/answers`, { body: { council: council.trim(), date, body: body.trim() } });
      showToast('의회 답변을 올렸어요');
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '올리지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title="의회 답변 올리기" description="전달 결과를 먼저 올린 캠페인에서, 의회마다 받은 답변을 남겨요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button disabled={busy} onClick={() => void submit()}>올리기</Button></>}
    >
      <div className="ed-modal-form">
        <label className="ed-row"><span className="ed-label">전달처</span>
          <input className="input" list="adm-councils" value={council} maxLength={40} onChange={(e) => setCouncil(e.target.value)} />
          <datalist id="adm-councils">{councils.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="ed-row"><span className="ed-label">답변 날짜</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="ed-row"><span className="ed-label">답변 내용</span>
          <textarea className="input ed-textarea" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}
