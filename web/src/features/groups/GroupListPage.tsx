import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Button, EmptyState, Spinner } from '../../components/ui';
import { GroupCard } from './GroupCard';
import { POLICY_LABEL_LONG, type GroupView, type JoinPolicy } from './types';
import './groups.css';

interface Popular { id: string; boardId: string; title: string; category: string; groupName: string; author: string; commentCount: number; likeCount: number; simDate: string | null }
const SIDO = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const SHOWN = 9;

async function loadAll(): Promise<GroupView[]> {
  const out: GroupView[] = [];
  let cursor: string | null = '0';
  for (let i = 0; i < 5 && cursor !== null; i++) {
    const r: { items: GroupView[]; nextCursor: string | null } = await api(`/api/groups?cursor=${cursor}`, { quiet: true });
    out.push(...r.items);
    cursor = r.nextCursor;
  }
  return out;
}

/** C 모임 목록 */
export function GroupListPage() {
  const nav = useNavigate();
  const [groups, setGroups] = useState<GroupView[] | null>(null);
  const [popular, setPopular] = useState<Popular[] | null>(null);
  const [region, setRegion] = useState('전체');
  const [policy, setPolicy] = useState<JoinPolicy | ''>('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'active' | 'new'>('active');
  const [more, setMore] = useState(false);

  useEffect(() => {
    let alive = true;
    loadAll().then((g) => alive && setGroups(g)).catch(() => alive && setGroups([]));
    api<{ items: Popular[] }>('/api/popular?limit=6', { quiet: true }).then((r) => alive && setPopular(r.items)).catch(() => alive && setPopular([]));
    return () => { alive = false; };
  }, []);

  const regions = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups ?? []) { const k = g.sido || '전국·온라인'; m.set(k, (m.get(k) ?? 0) + 1); }
    const known = ['전국·온라인', ...SIDO].filter((r) => m.has(r)).map((r) => [r, m.get(r)!] as const);
    return known;
  }, [groups]);
  const policyCount = (p: JoinPolicy) => (groups ?? []).filter((g) => g.joinPolicy === p).length;

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const list = (groups ?? []).filter((g) =>
      (region === '전체' || (g.sido || '전국·온라인') === region) && (!policy || g.joinPolicy === policy) &&
      (!kw || g.name.toLowerCase().includes(kw) || (g.sido || '').includes(kw) || (g.sigungu || '').includes(kw)));
    return sort === 'active' ? [...list].sort((a, b) => (b.newPostsThisWeek ?? 0) - (a.newPostsThisWeek ?? 0)) : list;
  }, [groups, region, policy, q, sort]);
  const visible = more ? shown : shown.slice(0, SHOWN);

  return (
    <div className="container page glist">
      <div className="glist-head">
        <div>
          <h1 className="page-title">모임</h1>
          <p className="glist-lead">늘 소통하는 단위예요. 동네 모임도, 주제로 모이는 전국 모임도 있어요.</p>
        </div>
        <Button size="lg" onClick={() => nav('/groups/new')}>+ 모임 만들기</Button>
      </div>
      <div className="glist-body">
        <aside className="gfilter" aria-label="모임 거르기">
          <h2>지역</h2>
          <label className="gfilter-row"><input type="radio" name="region" checked={region === '전체'} onChange={() => setRegion('전체')} /> 전체 <small>{groups?.length ?? 0}</small></label>
          {regions.map(([r, n]) => (
            <label key={r} className="gfilter-row"><input type="radio" name="region" checked={region === r} onChange={() => setRegion(r)} /> {r.replace('·', ' · ')} <small>{n}</small></label>
          ))}
          <h2>가입 방식</h2>
          {(['open', 'approval', 'private'] as const).map((p) => (
            <label key={p} className="gfilter-row"><input type="checkbox" checked={policy === p} onChange={() => setPolicy(policy === p ? '' : p)} /> {POLICY_LABEL_LONG[p]} <small>{policyCount(p)}</small></label>
          ))}
        </aside>
        <div className="glist-main">
          <section aria-label="모임 인기 게시물">
            <h2 className="gsec-title">모임 인기 게시물</h2>
            <p className="gsec-sub">모든 공개 모임에서 이번 주 많이 읽고 댓글이 오간 글이에요.</p>
            {popular === null && <Spinner />}
            {popular && popular.length === 0 && <EmptyState title="이번 주 인기 게시물이 아직 없어요">모임에 글이 올라오면 여기에 소개돼요.</EmptyState>}
            {popular && popular.length > 0 && (
              <ol className="gpop">
                {popular.map((p, i) => (
                  <li key={p.id}>
                    <Link to={`/groups/${p.boardId}/posts/${p.id}`}>
                      <span className="gpop-no">{i + 1}</span>
                      <span className="gpop-main">
                        <span className="gpop-tags"><span className="gpop-group">{p.groupName}</span>{p.category && <span className="gpop-cat">{p.category}</span>}</span>
                        <strong>{p.title}</strong>
                        <small>{p.author} · 댓글 {p.commentCount} · 공감 {p.likeCount}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <div className="glist-bar">
            <strong>모임 {shown.length}개</strong>
            <input className="input" type="search" placeholder="모임 이름, 지역 검색" aria-label="모임 이름, 지역 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input" aria-label="정렬" value={sort} onChange={(e) => setSort(e.target.value as 'active' | 'new')}>
              <option value="active">활동 많은 순</option><option value="new">새로 연 순</option>
            </select>
          </div>
          {groups === null && <Spinner />}
          {groups && shown.length === 0 && <EmptyState title="맞는 모임이 없어요" action={<Button onClick={() => nav('/groups/new')}>모임 만들기</Button>}>조건을 바꾸거나 직접 열어 보세요.</EmptyState>}
          <div className="gcards">{visible.map((g) => <GroupCard key={g.id} g={g} />)}</div>
          {!more && shown.length > SHOWN && <div className="gmore"><Button variant="outline" pill onClick={() => setMore(true)}>모임 더 보기 ({shown.length - SHOWN})</Button></div>}
          <div className="gcta">
            <div><strong>찾는 모임이 없나요?</strong><p>관심 있는 주제나 동네로 모임을 직접 열어 보세요. 단톡방도 연결할 수 있어요.</p></div>
            <Button variant="outline" pill onClick={() => nav('/groups/new')}>모임 만들기</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
