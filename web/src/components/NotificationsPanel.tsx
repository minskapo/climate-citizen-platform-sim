import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { koShort } from '@shared/date';
import { api } from '../lib/api';
import { syncNotifications } from '../lib/notifications';
import { EmptyState, LoadError, Spinner } from './ui';

export interface Notif { id: string; kind: string; text: string; link: string; read: boolean; createdAt: string; simDate: string | null }

/** 알림 링크가 글 주소(/posts/:id)이면 글이 속한 게시판 화면으로 바꿔 준다. */
async function resolve(link: string): Promise<string> {
  const m = /^\/posts\/([^/]+)$/.exec(link);
  if (!m) return link || '/';
  try {
    const p = await api<{ id: string; boardType: string; boardId: string }>(`/api/posts/${m[1]}`, { quiet: true });
    return p.boardType === 'campaign' ? `/campaigns/${p.boardId}/posts/${p.id}` : `/groups/${p.boardId}/posts/${p.id}`;
  } catch {
    return '/me?tab=notifications';
  }
}

/** 알림함: 화면을 열면 안 읽은 알림을 읽음 처리한다(처음 열 때의 안 읽음 표시는 그대로 보여 준다). */
export function NotificationsPanel() {
  const nav = useNavigate();
  const [items, setItems] = useState<Notif[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const marked = useRef(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    api<{ items: Notif[]; unread: number }>('/api/notifications', { quiet: true })
      .then(async (r) => {
        if (!alive) return;
        setItems(r.items);
        if (r.unread > 0 && !marked.current) {
          marked.current = true;
          try {
            await api('/api/notifications/read', { method: 'POST', body: {}, quiet: true });
            await syncNotifications();
          } catch { /* 다음에 열 때 다시 읽음 처리 */ marked.current = false; }
        }
      })
      .catch(() => { if (alive) { setItems(null); setFailed(true); } });
    return () => { alive = false; };
  }, [tries]);
  if (failed) return <LoadError text="알림을 불러오지 못했어요" onRetry={() => setTries((x) => x + 1)} />;
  if (items === null) return <Spinner />;
  if (items.length === 0) return <EmptyState title="새 알림이 없어요">미션 알림, 공지, 댓글 소식이 생기면 여기에 모여요.</EmptyState>;
  return (
    <ul className="notifs" aria-label="알림 목록">
      {items.map((n) => (
        <li key={n.id} className={n.read ? '' : 'is-unread'}>
          <button type="button" onClick={async () => nav(await resolve(n.link))}>
            {!n.read && <i className="notifs-dot" aria-label="안 읽음" />}
            <span className="notifs-text">{n.text}</span>
            <span className="notifs-when">{koShort(n.simDate ?? n.createdAt.slice(0, 10)).replace(/\(.\)$/, '')}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
