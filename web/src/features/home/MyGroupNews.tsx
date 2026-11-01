import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { koShort } from '@shared/date';
import { api } from '../../lib/api';
import { Chip } from '../../components/ui';
import type { PostSummary } from '../../components/BoardList';
import type { GroupView } from '../groups/types';

type News = PostSummary & { groupId: string; groupName: string };
const MAX_GROUPS = 5;

/** A-2 「내 모임 새 소식」: 가입한 모임 최근 글 */
export function MyGroupNews({ groups }: { groups: GroupView[] | null }) {
  const [items, setItems] = useState<News[] | null>(null);
  useEffect(() => {
    if (!groups) return;
    let alive = true;
    Promise.all(groups.slice(0, MAX_GROUPS).map((g) =>
      api<{ items: PostSummary[] }>(`/api/boards/group/${g.id}/posts`, { quiet: true })
        .then((r) => r.items.filter((p) => !p.hidden).slice(0, 4).map((p) => ({ ...p, groupId: g.id, groupName: g.name })))
        .catch(() => [] as News[]),
    )).then((all) => {
      if (!alive) return;
      setItems(all.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4));
    });
    return () => { alive = false; };
  }, [groups]);
  if (!groups) return null;
  const fresh = groups.reduce((n, g) => n + (g.newPostsThisWeek ?? 0), 0);
  return (
    <section className="container hsec" aria-label="내 모임 새 소식">
      <div className="card hnews">
        <div className="hsec-head">
          <div>
            <h2 className="hsec-title">내 모임 새 소식</h2>
            <p className="hsec-sub">{groups.length ? `가입한 모임 ${groups.length}곳에서 이번 주 새 글 ${fresh}개가 올라왔어요.` : '아직 가입한 모임이 없어요. 관심 있는 모임에 가입해 보세요.'}</p>
          </div>
          <Link to="/me" className="hsec-more">내 활동 →</Link>
        </div>
        {groups.length > 0 && (items === null ? null : items.length === 0
          ? <p className="hsec-sub">아직 올라온 글이 없어요.</p>
          : (
            <ul className="hnews-list">
              {items.map((p) => (
                <li key={p.id}>
                  <Link to={`/groups/${p.groupId}/posts/${p.id}`}>
                    <Chip tone="gray">{p.groupName}</Chip>
                    {p.category && <Chip tone="yellow">{p.category}</Chip>}
                    <b>{p.title}</b>
                    <span className="hnews-when">{koShort(p.simDate ?? p.createdAt.slice(0, 10)).replace(/\(.\)$/, '')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        {groups.length === 0 && <Link to="/groups" className="btn btn-outline btn-md">모임 둘러보기</Link>}
      </div>
    </section>
  );
}
