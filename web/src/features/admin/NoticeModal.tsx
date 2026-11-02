import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';

export interface NoticeTarget { key: 'all' | 'no_start' | 'reminder_off' | 'no_record'; label: string; count: number }

/** 참가자에게 공지 보내기: 받는 사람 · 제목 · 내용 · 게시판 공지로도 올리기 */
export function NoticeModal({ campaignId, targets, defaultTarget = 'all', onClose, onSent }: {
  campaignId: string; targets: NoticeTarget[]; defaultTarget?: NoticeTarget['key']; onClose(): void; onSent?(): void;
}) {
  const [target, setTarget] = useState<NoticeTarget['key']>(defaultTarget);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [board, setBoard] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const count = targets.find((t) => t.key === target)?.count ?? 0;

  const send = async () => {
    setErr(null);
    if (!title.trim()) { setErr('제목을 적어 주세요'); return; }
    if (!body.trim()) { setErr('내용을 적어 주세요'); return; }
    setBusy(true);
    try {
      const r = await api<{ sent: number }>(`/api/campaigns/${campaignId}/notices`, { body: { target, title: title.trim(), body: body.trim(), alsoBoard: board } });
      showToast(`공지를 보냈어요 · ${r.sent.toLocaleString('ko-KR')}명`);
      onSent?.();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '보내지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title="참가자에게 공지 보내기" description="앱 알림으로 가고, 참가자 게시판 공지로도 올라가요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button disabled={busy || count === 0} onClick={() => void send()}>{count.toLocaleString('ko-KR')}명에게 보내기</Button></>}
    >
      <div className="ed-modal-form">
        <div className="ed-row">
          <span className="ed-label">받는 사람</span>
          <div className="ed-chips" role="radiogroup" aria-label="받는 사람">
            {targets.map((t) => (
              <button key={t.key} type="button" role="radio" aria-checked={target === t.key} className={`ed-chip${target === t.key ? ' is-on' : ''}`} onClick={() => setTarget(t.key)}>
                {t.label} {t.count.toLocaleString('ko-KR')}명
              </button>
            ))}
          </div>
        </div>
        <label className="ed-row">
          <span className="ed-label">제목</span>
          <input className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="ed-row">
          <span className="ed-label">내용</span>
          <textarea className="input ed-textarea" rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <label className="ed-consent">
          <input type="checkbox" checked={board} onChange={(e) => setBoard(e.target.checked)} /> 참가자 게시판 공지로도 올리기
        </label>
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}
