import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Editor } from './Editor';
import { Modal } from './Modal';
import { showToast } from './Toast';
import { Button, Chip, EmptyState, Spinner } from './ui';

export interface PostSummary {
  id: string; category: string; title: string; author: string; pinned: boolean; hidden: boolean;
  simDate: string | null; createdAt: string; commentCount: number; likeCount: number; attachmentCount: number;
}

const PAGE = 20;
const shortDate = (p: PostSummary) => {
  const d = p.simDate ?? p.createdAt.slice(0, 10);
  const [, m, day] = d.split('-');
  return m && day ? `${Number(m)}. ${Number(day)}.` : d;
};

/** 게시판 글 목록: 분류 · 검색 · 쪽 넘기기 · 글쓰기. 모임 게시판과 캠페인 참가자 게시판이 함께 쓴다. */
export function BoardList({ type, id, categories, category, postHref, canWrite, allowNotice, title = '전체 글', reloadKey = 0, onPosted }: {
  type: 'group' | 'campaign'; id: string; categories: string[]; category?: string;
  postHref(postId: string): string; canWrite: boolean; allowNotice: boolean; title?: string; reloadKey?: number; onPosted?(): void;
}) {
  const [items, setItems] = useState<PostSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => { setPageNo(1); }, [category, query, id, type]);

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ cursor: String((pageNo - 1) * PAGE) });
    if (category) sp.set('category', category);
    if (query) sp.set('q', query);
    try {
      const r = await api<{ items: PostSummary[]; nextCursor: string | null }>(`/api/boards/${type}/${id}/posts?${sp}`, { quiet: true });
      setItems(r.items);
      setNext(r.nextCursor);
      setError(null);
    } catch (e) {
      setItems([]);
      setError(e instanceof ApiError && e.status === 403 ? '참가자와 운영진만 볼 수 있는 게시판이에요' : (e as Error).message || '글을 불러오지 못했어요');
    }
  }, [type, id, category, query, pageNo]);
  useEffect(() => { void load(); }, [load, reloadKey, tick]);

  return (
    <section className="board card">
      <div className="board-head">
        <h2>{category || title}</h2>
        <form className="board-search" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <input className="input" value={q} placeholder="글 검색" aria-label="글 검색" onChange={(e) => setQ(e.target.value)} />
        </form>
        {canWrite && <Button onClick={() => setWriting(true)}>{allowNotice ? '글쓰기 · 공지' : '글쓰기'}</Button>}
      </div>
      {items === null && <Spinner />}
      {items && error && <EmptyState title={error} />}
      {items && !error && items.length === 0 && (
        <EmptyState title={query ? '찾는 글이 없어요' : '아직 올라온 글이 없어요'}>{!query && canWrite ? '첫 글을 남겨 보세요.' : undefined}</EmptyState>
      )}
      {items && items.length > 0 && (
        <ul className="board-rows">
          {items.map((p) => (
            <li key={p.id} className={p.pinned ? 'is-pinned' : undefined}>
              <Link to={postHref(p.id)}>
                <span className="board-cat">{p.pinned && !p.category ? '공지' : p.category || '글'}</span>
                <span className="board-title">{p.title}{p.hidden && <Chip tone="red" square className="board-hidden">숨김</Chip>}</span>
                <span className="board-cmt">댓글 {p.commentCount}</span>
                <span className="board-author">{p.author}</span>
                <span className="board-date">{shortDate(p)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items && (pageNo > 1 || next) && (
        <nav className="board-pager" aria-label="쪽 넘기기">
          <button type="button" disabled={pageNo <= 1} onClick={() => setPageNo(pageNo - 1)} aria-label="이전 쪽">‹</button>
          <span className="is-on">{pageNo}</span>
          <button type="button" disabled={!next} onClick={() => setPageNo(pageNo + 1)} aria-label="다음 쪽">›</button>
        </nav>
      )}
      {writing && (
        <Modal open onClose={() => setWriting(false)} title="글쓰기" description="지금 보고 있는 게시판에 올라가요. 「공지」는 운영진만 쓸 수 있어요." width={640}>
          <Editor
            categories={categories}
            allowNotice={allowNotice}
            onCancel={() => setWriting(false)}
            onSubmit={async (v) => {
              await api(`/api/boards/${type}/${id}/posts`, { body: { category: v.category, title: v.title, body: v.body, attachments: v.attachments }, quiet: true });
              showToast(v.attachments.some((a) => a.mime.startsWith('image/')) ? `사진 ${v.attachments.filter((a) => a.mime.startsWith('image/')).length}장을 올렸어요` : '글을 올렸어요');
              setWriting(false);
              setTick((n) => n + 1);
              onPosted?.();
            }}
          />
        </Modal>
      )}
    </section>
  );
}
