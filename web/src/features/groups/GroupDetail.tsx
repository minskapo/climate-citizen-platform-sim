import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addDays, koRange, koShort } from '@shared/date';
import type { ISODate, Schedule } from '@shared/types';
import { BoardList } from '../../components/BoardList';
import { ReportModal } from '../../components/ReportModal';
import { showToast } from '../../components/Toast';
import { Button, Chip, EmptyState, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { CollabModal } from '../collab/CollabModal';
import { InviteAccept } from './InviteAccept';
import { StaffNotices } from './StaffNotices';
import { IN_ROLES, POLICY_LABEL, STATUS_LABEL, STATUS_TONE, type GroupView } from './types';
import './groups.css';

interface GCampaign { id: string; type: string; title: string; status: string; schedule: Schedule; participantCount: number; host: { id?: string } }
const TYPE_LABEL: Record<string, string> = { practice: '실천', signature: '서명', offline: '오프라인 모임' };

export async function loadGroupCampaigns(groupId: string): Promise<GCampaign[]> {
  const out: GCampaign[] = [];
  let cursor: string | null = '0';
  for (let i = 0; i < 5 && cursor !== null; i++) {
    const r: { items: GCampaign[]; nextCursor: string | null } = await api(`/api/campaigns?cursor=${cursor}`, { quiet: true });
    out.push(...r.items.filter((c) => c.host?.id === groupId));
    cursor = r.nextCursor;
  }
  return out;
}

export function campaignWhen(c: { type: string; schedule: Schedule }): string {
  const s = c.schedule ?? ({} as Schedule);
  const d = (x?: ISODate) => (x ? koShort(x) : '');
  if (c.type === 'offline') return `${TYPE_LABEL.offline} · ${d(s.eventDate)}`;
  if (c.type === 'practice' && s.runStart) return `${TYPE_LABEL.practice} · ${koRange(s.runStart, addDays(s.runStart, (s.runDays ?? 1) - 1))}`;
  if (c.type === 'signature') return `${TYPE_LABEL.signature} · ${s.recruitStart && s.recruitEnd ? koRange(s.recruitStart, s.recruitEnd) : ''}`;
  return TYPE_LABEL[c.type] ?? '';
}

/** 사용자 입장(비회원 · 멤버 · 운영진)을 한 번에 계산한다. */
export function useGroupAccess(g: GroupView | null) {
  const sim = useSim();
  const guest = sim.role === 'guest' || !sim.userId;
  const simStaff = !!g && ((sim.role === 'staff' && sim.staffGroupId === g.id) || sim.role === 'admin');
  const staff = simStaff || g?.myRole === 'owner' || g?.myRole === 'staff';
  const member = staff || g?.myRole === 'member';
  return { sim, guest, staff: !!staff, member: !!member, owner: g?.myRole === 'owner' };
}

/** G 비회원 · 멤버 / G-1 운영진 모임 상세 */
export function GroupDetail() {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const invite = sp.get('invite') ?? '';
  const nav = useNavigate();
  const [g, setG] = useState<GroupView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [camps, setCamps] = useState<GCampaign[] | null>(null);
  const [category, setCategory] = useState('');
  const [board, setBoard] = useState<{ type: 'group' | 'campaign'; id: string; title?: string }>({ type: 'group', id });
  const [campMenu, setCampMenu] = useState(false);
  const [collab, setCollab] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bump, setBump] = useState(0);
  const { sim, guest, staff, member, owner } = useGroupAccess(g);

  const load = useCallback(async () => {
    try {
      setG(await api<GroupView>(`/api/groups/${id}`, { quiet: true }));
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 404 ? '모임을 찾을 수 없어요' : (e as Error).message || '모임을 불러오지 못했어요');
    }
  }, [id]);
  useEffect(() => { setG(null); setBoard({ type: 'group', id }); setCategory(''); void load(); }, [load, id, sim.role, sim.userId, sim.staffGroupId]);
  const readable = !!g && (g.joinPolicy !== 'private' || member);
  useEffect(() => {
    if (!readable) { setCamps(null); return; }
    let alive = true;
    loadGroupCampaigns(id).then((c) => alive && setCamps(c)).catch(() => alive && setCamps([]));
    return () => { alive = false; };
  }, [id, readable]);

  if (err) return <div className="container page"><EmptyState title={err} action={<Link className="btn btn-outline btn-md" to="/groups">모임 목록으로</Link>} /></div>;
  if (!g) return <div className="container page"><Spinner /></div>;

  const pending = g.myRole === 'pending';
  const join = async () => {
    if (guest) { nav('/login'); return; }
    setBusy(true);
    try {
      const r = await api<{ role: string }>(`/api/groups/${g.id}/join`, { body: {}, quiet: true });
      showToast(r.role === 'pending' ? '가입을 신청했어요 · 운영진이 확인하면 가입돼요' : '모임에 가입했어요');
      await load();
    } catch (e) {
      showToast((e as Error).message || '가입하지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    try {
      await api(`/api/groups/${g.id}/leave`, { method: 'POST', body: {}, quiet: true });
      showToast('모임에서 나왔어요');
      await load();
    } catch (e) {
      showToast((e as Error).message || '나가지 못했어요');
    }
  };
  const acceptTransfer = async () => {
    try {
      await api(`/api/groups/${g.id}/transfer/accept`, { method: 'POST', body: {}, quiet: true });
      showToast('모임장을 넘겨받았어요');
      await load();
    } catch (e) {
      showToast((e as Error).message || '수락하지 못했어요');
    }
  };

  const cats = g.categories ?? [];
  const closed = g.closed || !!g.closedAt;
  const region = [g.sido || '전국·온라인', g.sigungu].filter(Boolean).join(' ');
  const transferToMe = staff && !!sim.userId && g.pendingTransferTo === sim.userId;

  const joinButton = pending
    ? <Button size="lg" disabled>승인 대기 중</Button>
    : <Button size="lg" disabled={busy || closed} onClick={() => void join()}>{g.joinPolicy === 'approval' ? '가입 신청하기' : '모임 가입하기'}</Button>;

  return (
    <div className="gdetail">
      <div className="gdetail-top">
        <div className="container">
          <nav className="crumbs" aria-label="현재 위치"><Link to="/groups">모임</Link> › <span>{g.name}</span></nav>
          <div className="ghead">
            <span className="ghead-avatar" aria-hidden="true">{[...g.name][0]}</span>
            <div className="ghead-main">
              <span className="gcard-tag">{g.sido || '전국'} · {g.joinPolicy === 'private' ? '비공개' : POLICY_LABEL[g.joinPolicy]}</span>
              <h1>{g.name}{closed && <Chip tone="gray" square className="ghead-closed">닫힌 모임</Chip>}</h1>
              {readable && g.description && <p className="ghead-desc">{g.description}</p>}
              {readable && (
                <p className="ghead-stat">
                  {(g.memberCount ?? 0).toLocaleString('ko-KR')}명 · 이번 주 새 글 {g.newPostsThisWeek ?? 0}개{g.createdAt ? ` · ${koShort(g.createdAt.slice(0, 10) as ISODate)} 개설` : ''}
                </p>
              )}
            </div>
            <div className="ghead-side">
              {staff && !closed && <Link to={`/groups/${g.id}/manage`} className="btn btn-primary btn-lg">⚙ 모임 관리</Link>}
              {staff && <span className="ghead-role"><Chip tone="green" square>운영진</Chip> 이 모임의 운영진이에요</span>}
              {!member && g.joinPolicy !== 'private' && joinButton}
              {!member && g.joinPolicy !== 'private' && <small>{g.joinPolicy === 'approval' ? '운영진이 승인하면 단톡방 링크와 새 글 알림을 받아요' : '가입하면 단톡방 링크와 새 글 알림을 받아요'}</small>}
            </div>
          </div>
        </div>
        {readable && (
          <div className="container">
            <div className="gtabs" role="tablist" aria-label="게시판 분류">
              <button type="button" role="tab" aria-selected={board.type === 'group' && !category} className={board.type === 'group' && !category ? 'on' : undefined} onClick={() => { setBoard({ type: 'group', id: g.id }); setCategory(''); }}>전체</button>
              {cats.map((c) => (
                <button key={c} type="button" role="tab" aria-selected={board.type === 'group' && category === c} className={board.type === 'group' && category === c ? 'on' : undefined} onClick={() => { setBoard({ type: 'group', id: g.id }); setCategory(c); }}>{c}</button>
              ))}
              {camps && camps.length > 0 && (
                <span className="gtabs-menu">
                  <button type="button" className={board.type === 'campaign' ? 'on' : undefined} aria-haspopup="menu" aria-expanded={campMenu} onClick={() => setCampMenu(!campMenu)}>캠페인 게시판 ▾ <small>{camps.length}</small></button>
                  {campMenu && (
                    <ul role="menu">
                      {camps.map((c) => (
                        <li key={c.id} role="none"><button type="button" role="menuitem" onClick={() => { setBoard({ type: 'campaign', id: c.id, title: c.title }); setCategory(''); setCampMenu(false); }}>{c.title}</button></li>
                      ))}
                    </ul>
                  )}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="container gdetail-body">
        <div className="gdetail-main">
          {transferToMe && (
            <div className="gstaff gstaff-transfer">
              <span>모임장을 넘겨받아 달라는 요청이 왔어요{g.pendingTransferExpires ? ` · ${koShort(g.pendingTransferExpires.slice(0, 10) as ISODate)}까지 수락해 주세요` : ''}</span>
              <Button size="sm" onClick={() => void acceptTransfer()}>수락하기</Button>
            </div>
          )}
          {staff && <StaffNotices groupId={g.id} reloadKey={bump} />}
          {!readable && (
            <div className="card gprivate">
              <h2>비공개 모임이에요</h2>
              <p>초대받은 사람만 들어올 수 있어요. 목록에는 이름과 지역만 보여요.</p>
            </div>
          )}
          {!readable && invite && !pending && <InviteAccept groupId={g.id} groupName={g.name} code={invite} onJoined={() => void load()} />}
          {!readable && !invite && pending && <p className="gprivate-note">승인을 기다리고 있어요.</p>}
          {readable && (
            <section className="card gcamps">
              <h2>이 모임의 캠페인</h2>
              {camps === null && <Spinner />}
              {camps && camps.length === 0 && <p className="gcamps-empty">아직 주최한 캠페인이 없어요</p>}
              {camps && camps.map((c) => (
                <div key={c.id} className="gcamp">
                  <div className="gcamp-main">
                    <div className="gcamp-title"><Chip tone={STATUS_TONE[c.status] ?? 'gray'} square>{STATUS_LABEL[c.status] ?? c.status}</Chip><strong>{c.title}</strong></div>
                    <small>{campaignWhen(c)}</small>
                  </div>
                  <span className="gcamp-n">{c.participantCount}명 {c.status === 'scheduled' ? '알림 신청' : '참여'}</span>
                  <Link to={`/campaigns/${c.id}`} className="link-btn">자세히 보기 →</Link>
                </div>
              ))}
              {staff && !closed && (
                <div className="gcollab"><span>우리 모임이 주최할 새 캠페인이 있나요?</span><button type="button" className="link-btn" onClick={() => setCollab(true)}>캠페인 협업 제안하기 →</button></div>
              )}
            </section>
          )}
          {readable && (
            <BoardList
              type={board.type}
              id={board.id}
              title={board.type === 'campaign' ? board.title ?? '캠페인 게시판' : '전체 글'}
              categories={cats}
              category={board.type === 'group' ? category : undefined}
              postHref={(pid) => `/groups/${g.id}/posts/${pid}`}
              canWrite={board.type === 'group' && member && !closed}
              allowNotice={staff}
              reloadKey={bump}
              onPosted={() => setBump((n) => n + 1)}
            />
          )}
        </div>
        <aside className="gdetail-side">
          {readable && member && (
            <div className="card gside">
              <h2>가입됨 {staff && <Chip tone="green" square>운영진</Chip>}</h2>
              <p className="gside-sub">{(g.memberCount ?? 0).toLocaleString('ko-KR')}명이 함께하고 있어요</p>
              {g.chatLink && <a className="btn btn-outline btn-md btn-block btn-pill" href={g.chatLink} target="_blank" rel="noopener noreferrer">단톡방 열기 ↗</a>}
              {g.myRole && g.myRole !== 'owner' && IN_ROLES.includes(g.myRole) && <button type="button" className="link-btn gside-leave" onClick={() => void leave()}>모임 나가기</button>}
              {owner && <p className="field-hint">모임장은 먼저 모임장을 넘긴 뒤에 나갈 수 있어요.</p>}
            </div>
          )}
          {readable && (
            <div className="card gside">
              <h2>모임 정보</h2>
              <dl className="ginfo">
                <dt>지역</dt><dd>{region}</dd>
                <dt>가입 방식</dt><dd>{POLICY_LABEL[g.joinPolicy]}</dd>
                <dt>단톡방</dt><dd>{member ? (g.chatLink ? <a href={g.chatLink} target="_blank" rel="noopener noreferrer">{g.chatLink.replace(/^https?:\/\//, '')} ↗</a> : '연결 안 됨') : '가입 후 공개'}</dd>
              </dl>
              {!staff && <button type="button" className="link-btn" onClick={() => setReporting(true)}>모임 신고</button>}
            </div>
          )}
        </aside>
      </div>
      {collab && <CollabModal groupId={g.id} onClose={() => setCollab(false)} />}
      {reporting && <ReportModal targetType="group" targetId={g.id} onClose={() => setReporting(false)} />}
    </div>
  );
}
