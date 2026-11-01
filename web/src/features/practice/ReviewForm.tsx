import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { showToast } from '../../components/Toast';
import { Button } from '../../components/ui';
import { postPath } from '../campaigns/ParticipantBoard';
import type { CampaignDetail } from '../campaigns/types';

/** 후기 남기기: 주최 모임 게시판에 「후기」 분류가 있으면 그곳, 아니면 캠페인 참가자 게시판의 「후기」. */
export function ReviewForm({ detail }: { detail: CampaignDetail }) {
  const c = detail.campaign;
  const [groupBoard, setGroupBoard] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);

  useEffect(() => {
    if (c.host.type !== 'group' || !c.host.id) return;
    let alive = true;
    api<{ categories?: string[]; myRole: string | null }>(`/api/groups/${c.host.id}`, { quiet: true })
      .then((g) => alive && setGroupBoard(!!g.categories?.includes('후기') && ['owner', 'staff', 'member'].includes(g.myRole ?? '')))
      .catch(() => undefined);
    return () => { alive = false; };
  }, [c.host.type, c.host.id]);

  const submit = async () => {
    if (!title.trim()) { setError('제목을 써 주세요'); return; }
    if (!body.trim()) { setError('후기를 써 주세요'); return; }
    setBusy(true);
    setError(null);
    try {
      const path = groupBoard ? `/api/boards/group/${c.host.id}/posts` : `/api/boards/campaign/${c.id}/posts`;
      const r = await api<{ id: string }>(path, { body: { category: '후기', title: title.trim(), body, attachments: [] }, quiet: true });
      showToast('후기를 올렸어요 · 게시판 「후기」에 모여요');
      setPosted(groupBoard ? `/groups/${c.host.id}/posts/${r.id}` : postPath(c.id, r.id));
      setTitle('');
      setBody('');
    } catch (e) {
      setError((e as Error).message || '후기를 올리지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card creview" aria-label="후기 남기기">
      <h2>후기 남기기</h2>
      <p className="csec-sub">
        {groupBoard ? `후기는 주최 모임 「${c.host.name}」 게시판의 「후기」에 올라가요.` : '후기는 참가자 게시판의 「후기」에 올라가요.'} 다음 기수를 준비하는 데에도 쓰여요.
      </p>
      {posted && <p className="creview-done">후기를 올렸어요. <Link to={posted} className="link-btn">올린 후기 보기 →</Link></p>}
      <input className="input" aria-label="제목" placeholder="제목" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input creview-body" aria-label="후기" rows={5} placeholder="한 달 동안 가장 기억에 남는 순간, 계속 지키고 싶은 실천을 적어 주세요." value={body} onChange={(e) => setBody(e.target.value)} />
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="creview-foot">
        <span className="chip chip-outline">공개 범위: {groupBoard ? '모임 멤버' : '참가자만'}</span>
        <Button onClick={submit} disabled={busy}>후기 올리기</Button>
      </div>
    </section>
  );
}
