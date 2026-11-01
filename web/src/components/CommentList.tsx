import { useState } from 'react';
import { api } from '../lib/api';
import { ReportModal } from './ReportModal';
import { showToast } from './Toast';
import { Button } from './ui';
import { linkify } from './linkify';

export interface CommentItem { id: string; authorId: string; author: string; body: string; createdAt: string; hidden?: boolean }

const dateOf = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}. ${d.getDate()}.`; };

/** 댓글 목록과 쓰기 칸. canWrite가 아니면 쓰기 칸 대신 안내를 보여 준다. */
export function CommentList({ postId, comments, canWrite, notice, onAdded }: {
  postId: string; comments: CommentItem[]; canWrite: boolean; notice?: string; onAdded(): void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);

  const send = async () => {
    if (!text.trim()) { setError('댓글을 써 주세요'); return; }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/posts/${postId}/comments`, { body: { body: text.trim() }, quiet: true });
      setText('');
      showToast('댓글을 등록했어요');
      onAdded();
    } catch (e) {
      setError((e as Error).message || '댓글을 올리지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="comments" aria-label="댓글">
      <h3 className="comments-title">댓글 {comments.filter((c) => !c.hidden).length}</h3>
      {comments.length === 0 && <p className="comments-empty">아직 댓글이 없어요</p>}
      <ul className="comments-list">
        {comments.map((c) => (
          <li key={c.id} className={c.hidden ? 'is-hidden' : undefined}>
            <div className="comment-meta">
              <strong>{c.author || '알 수 없음'}</strong>
              <span>{dateOf(c.createdAt)}</span>
              {c.hidden && <span className="comment-tag">숨김</span>}
              <button type="button" className="link-btn" onClick={() => setReporting(c.id)}>신고</button>
            </div>
            <p>{linkify(c.body)}</p>
          </li>
        ))}
      </ul>
      {canWrite ? (
        <div className="comment-form">
          <textarea className="input" rows={2} maxLength={1000} value={text} placeholder="댓글을 남겨 주세요" aria-label="댓글 쓰기" onChange={(e) => setText(e.target.value)} />
          <Button size="md" disabled={busy} onClick={() => void send()}>댓글 달기</Button>
        </div>
      ) : (
        <p className="comments-empty">{notice ?? '멤버만 댓글을 쓸 수 있어요'}</p>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      {reporting && <ReportModal targetType="comment" targetId={reporting} onClose={() => setReporting(null)} />}
    </section>
  );
}
