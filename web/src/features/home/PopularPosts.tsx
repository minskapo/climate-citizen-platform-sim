import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { koShort } from '@shared/date';
import { api } from '../../lib/api';
import { Chip, EmptyState, Spinner } from '../../components/ui';

export interface Popular {
  id: string; boardId: string; title: string; category: string; groupName: string; author: string;
  commentCount: number; likeCount: number; simDate: string | null; createdAt?: string;
}

/** 모임 인기 게시물: 공개 모임 글 중 이번 주 많이 읽고 댓글이 오간 6개 */
export function PopularPosts() {
  const [items, setItems] = useState<Popular[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ items: Popular[] }>('/api/popular?days=7&limit=6', { quiet: true }).then((r) => alive && setItems(r.items)).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, []);
  return (
    <section className="container hsec" aria-label="모임 인기 게시물">
      <div className="hsec-head">
        <div>
          <h2 className="hsec-title">모임 인기 게시물</h2>
          <p className="hsec-sub">여러 모임에서 이번 주 많이 읽고 댓글이 오간 글이에요. 공개 모임의 글만 모아 보여 줘요.</p>
        </div>
        <Link to="/groups" className="hsec-more">전체 모임 →</Link>
      </div>
      {items === null ? <Spinner /> : items.length === 0
        ? <EmptyState title="이번 주 인기 글이 아직 없어요">모임에 글이 올라오면 여기에 모여요.</EmptyState>
        : (
          <ol className="hpop">
            {items.map((p, i) => {
              const d = p.simDate ?? p.createdAt?.slice(0, 10);
              return (
                <li key={p.id}>
                  <Link to={`/groups/${p.boardId}/posts/${p.id}`} className="hpop-a">
                    <span className="hpop-no">{i + 1}</span>
                    <span className="hpop-body">
                      <span className="hpop-tags"><Chip tone="green">{p.groupName}</Chip>{p.category && <Chip tone="blue">{p.category}</Chip>}</span>
                      <b className="hpop-title">{p.title}</b>
                      <span className="hpop-meta">{[p.author, d && koShort(d).replace(/\(.\)$/, ''), `댓글 ${p.commentCount}`, `공감 ${p.likeCount}`].filter(Boolean).join(' · ')}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
    </section>
  );
}
