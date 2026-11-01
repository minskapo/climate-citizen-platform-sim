import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PostView } from '../../components/PostView';
import { EmptyState, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useGroupAccess } from './GroupDetail';
import type { GroupView } from './types';
import './groups.css';

/** 모임 글 한 편 */
export function PostPage() {
  const { id = '', postId = '' } = useParams();
  const nav = useNavigate();
  const [g, setG] = useState<GroupView | null>(null);
  const [failed, setFailed] = useState(false);
  const { member, staff } = useGroupAccess(g);
  useEffect(() => {
    let alive = true;
    api<GroupView>(`/api/groups/${id}`, { quiet: true }).then((r) => alive && setG(r)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [id]);
  if (failed) return <div className="container page"><EmptyState title="모임을 찾을 수 없어요" /></div>;
  if (!g) return <div className="container page"><Spinner /></div>;
  return (
    <div className="container page gpost">
      <nav className="crumbs" aria-label="현재 위치"><Link to="/groups">모임</Link> › <Link to={`/groups/${g.id}`}>{g.name}</Link> › <span>글</span></nav>
      <PostView
        postId={postId}
        categories={g.categories ?? []}
        canComment={member && !g.closed}
        commentNotice={g.closed ? '닫힌 모임이에요' : '멤버만 댓글을 쓸 수 있어요'}
        onDeleted={() => nav(`/groups/${g.id}`)}
      />
      {staff && <p className="field-hint">운영진은 글을 고정하거나 숨길 수 있어요.</p>}
    </div>
  );
}
