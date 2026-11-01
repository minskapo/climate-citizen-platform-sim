import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { Button, Chip, EmptyState, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { CollabModal } from '../collab/CollabModal';
import { campaignWhen, loadGroupCampaigns, useGroupAccess } from './GroupDetail';
import { POLICY_LABEL_LONG, STATUS_LABEL, STATUS_TONE, type GroupView, type JoinPolicy } from './types';
import './groups.css';

interface Member { userId: string; nickname: string; region: string; role: string; joinedOn: string }
interface PostRow { id: string; title: string; category: string; pinned: boolean; hidden: boolean; author: string; simDate: string | null }
type Camp = Awaited<ReturnType<typeof loadGroupCampaigns>>[number];
const ROLE_LABEL: Record<string, string> = { owner: '모임장', staff: '운영진', member: '멤버', pending: '신청' };
const dot = (d: string) => { const [y, m, day] = d.split('-'); return `${y}. ${Number(m)}. ${Number(day)}.`; };
const md = (d: string | null) => { if (!d) return ''; const [, m, day] = d.split('-'); return `${Number(m)}. ${Number(day)}.`; };

type Dlg =
  | { k: 'staff'; m: Member } | { k: 'unstaff'; m: Member } | { k: 'kick'; m: Member }
  | { k: 'transfer' } | { k: 'close' } | { k: 'records'; c: Camp } | { k: 'collab' } | null;

/** G-2 모임 관리. 운영진만 볼 수 있다. */
export function GroupManage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [g, setG] = useState<GroupView | null>(null);
  const [failed, setFailed] = useState(false);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [camps, setCamps] = useState<Camp[] | null>(null);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);
  const { staff, owner, sim } = useGroupAccess(g);

  const [policy, setPolicy] = useState<JoinPolicy>('open');
  const [chat, setChat] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [newCat, setNewCat] = useState('');

  const loadGroup = useCallback(async () => {
    try {
      const r = await api<GroupView>(`/api/groups/${id}`, { quiet: true });
      setG(r);
      setPolicy(r.joinPolicy);
      setChat(r.chatLink ?? '');
      setCats(r.categories ?? []);
    } catch { setFailed(true); }
  }, [id]);
  const loadMembers = useCallback(async () => {
    try { setMembers((await api<{ items: Member[] }>(`/api/groups/${id}/members?q=${encodeURIComponent(q.trim())}`, { quiet: true })).items); }
    catch { setMembers([]); }
  }, [id, q]);
  const loadPosts = useCallback(async () => {
    try { setPosts((await api<{ items: PostRow[] }>(`/api/boards/group/${id}/posts`, { quiet: true })).items); } catch { setPosts([]); }
  }, [id]);

  useEffect(() => { void loadGroup(); }, [loadGroup, sim.role, sim.userId, sim.staffGroupId]);
  useEffect(() => {
    if (!staff) return;
    void loadPosts();
    loadGroupCampaigns(id).then(setCamps).catch(() => setCamps([]));
  }, [staff, id, loadPosts]);
  useEffect(() => { if (staff) void loadMembers(); }, [staff, loadMembers]);

  if (failed) return <div className="container page"><EmptyState title="모임을 찾을 수 없어요" /></div>;
  if (!g) return <div className="container page"><Spinner /></div>;
  if (!staff) {
    return (
      <div className="container page">
        <EmptyState title="운영진만 볼 수 있어요" action={<Link className="btn btn-outline btn-md" to={`/groups/${g.id}`}>모임 페이지로</Link>}>모임 관리는 운영진에게만 열려 있어요.</EmptyState>
      </div>
    );
  }

  const member = (uid: string, action: string, ok: string) =>
    api(`/api/groups/${id}/members/${uid}`, { body: { action }, quiet: true })
      .then(() => { showToast(ok); setDlg(null); void loadMembers(); void loadGroup(); })
      .catch((e: Error) => showToast(e.message || '처리하지 못했어요'));
  const post = (pid: string, path: string, ok: string) =>
    api(`/api/posts/${pid}/${path}`, { method: 'POST', body: {}, quiet: true }).then(() => { showToast(ok); void loadPosts(); }).catch((e: Error) => showToast(e.message));
  const invite = async () => {
    try {
      const r = await api<{ url: string }>(`/api/groups/${id}/invites`, { method: 'POST', body: {}, quiet: true });
      const full = `${location.origin}${location.pathname}${r.url}`;
      try { await navigator.clipboard.writeText(full); } catch { /* 복사가 막혀도 안내는 한다 */ }
      showToast('초대 링크를 복사했어요 · 7일 동안 쓸 수 있어요');
    } catch (e) { showToast((e as Error).message || '초대 링크를 만들지 못했어요'); }
  };
  const save = async () => {
    try {
      await api(`/api/groups/${id}`, { method: 'PATCH', body: { joinPolicy: policy, chatLink: chat.trim(), categories: cats }, quiet: true });
      showToast('모임 설정을 저장했어요');
      void loadGroup();
    } catch (e) { showToast((e as Error).message || '저장하지 못했어요'); }
  };
  const addCat = () => {
    const c = newCat.trim();
    if (!c) return;
    if ([...c].length > 12) { showToast('분류 이름은 12자까지 쓸 수 있어요'); return; }
    if (!cats.includes(c) && cats.length < 10) setCats([...cats, c]);
    setNewCat('');
  };

  const pending = (members ?? []).filter((m) => m.role === 'pending');
  const rest = (members ?? []).filter((m) => m.role !== 'pending');
  const shownMembers = showAll ? rest : rest.slice(0, 5);
  const pinned = posts.filter((p) => p.pinned);
  const hiddenPosts = posts.filter((p) => p.hidden);
  const closed = g.closed || !!g.closedAt;
  const region = [g.sido || '전국·온라인', g.sigungu].filter(Boolean).join(' · ');

  return (
    <div className="container page gmanage">
      <nav className="crumbs" aria-label="현재 위치"><Link to="/groups">모임</Link> › <Link to={`/groups/${g.id}`}>{g.name}</Link> › <span>모임 관리</span></nav>
      <div className="gmanage-head">
        <div>
          <h1 className="page-title">모임 관리 <Chip tone="green" square>운영진만 보여요</Chip></h1>
          <p className="glist-lead">{g.name} · {g.sido || '전국·온라인'} · {POLICY_LABEL_LONG[g.joinPolicy]} · {(g.memberCount ?? 0).toLocaleString('ko-KR')}명</p>
        </div>
        <Link to={`/groups/${g.id}`} className="btn btn-outline btn-md btn-pill">모임 페이지로 →</Link>
      </div>

      <section className="card gm-sec" aria-label="멤버">
        <div className="gm-head">
          <h2>멤버 <small>{g.memberCount ?? 0}</small></h2>
          <input className="input" type="search" placeholder="활동명 검색" aria-label="활동명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button variant="outline" onClick={() => void invite()} disabled={closed}>초대 링크 복사</Button>
        </div>
        {pending.length > 0 && (
          <div className="gm-pending">
            <h3>가입 신청 {pending.length}명</h3>
            {pending.map((m) => (
              <div key={m.userId} className="gm-row">
                <strong>{m.nickname}</strong><span>{m.region || '–'}</span><span>{dot(m.joinedOn)}</span>
                <span className="gm-actions">
                  <Button size="sm" onClick={() => void member(m.userId, 'approve', `${m.nickname} 님의 가입을 승인했어요`)}>승인</Button>
                  <Button size="sm" variant="ghost" onClick={() => void member(m.userId, 'kick', `${m.nickname} 님의 신청을 거절했어요`)}>거절</Button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="gm-table" role="table" aria-label="멤버 목록">
          <div className="gm-row gm-th" role="row"><span>활동명</span><span>지역</span><span>가입일</span><span>역할</span><span>관리</span></div>
          {members === null && <Spinner />}
          {members && rest.length === 0 && <p className="gcamps-empty">찾는 멤버가 없어요</p>}
          {shownMembers.map((m) => (
            <div key={m.userId} className="gm-row" role="row">
              <strong>{m.nickname}</strong><span>{m.region || '–'}</span><span>{dot(m.joinedOn)}</span><span>{ROLE_LABEL[m.role]}</span>
              <span className="gm-actions">
                {m.role === 'owner' && '–'}
                {owner && m.role === 'member' && <Button size="sm" variant="outline" onClick={() => setDlg({ k: 'staff', m })}>운영진 지정</Button>}
                {owner && m.role === 'staff' && <Button size="sm" variant="outline" onClick={() => setDlg({ k: 'unstaff', m })}>운영진 해제</Button>}
                {m.role === 'member' && <Button size="sm" variant="ghost" onClick={() => setDlg({ k: 'kick', m })}>내보내기</Button>}
                {m.role === 'staff' && owner && <Button size="sm" variant="ghost" onClick={() => setDlg({ k: 'kick', m })}>내보내기</Button>}
              </span>
            </div>
          ))}
        </div>
        {!showAll && rest.length > 5 && <button type="button" className="link-btn" onClick={() => setShowAll(true)}>{rest.length}명 모두 보기 →</button>}
        {g.joinPolicy === 'approval' && pending.length === 0 && <p className="field-hint">가입 방식이 「가입 승인」이라 신청이 오면 여기에 먼저 보여요.</p>}
      </section>

      <section className="card gm-sec" aria-label="게시판">
        <h2>게시판</h2>
        <p className="field-hint">공지는 운영진만 쓸 수 있어요. 문제가 있는 글은 운영진이 바로 숨길 수 있고, 관리자에게도 알려져요.</p>
        <h3>분류</h3>
        <div className="gcats">
          {cats.map((c) => <span key={c} className="gcat">{c}{c !== '공지' && <button type="button" aria-label={`${c} 빼기`} onClick={() => setCats(cats.filter((x) => x !== c))}>✕</button>}</span>)}
          <input className="input gcat-input" aria-label="새 분류 이름" placeholder="+ 분류 추가" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } }} />
        </div>
        <p className="field-hint">분류를 바꾼 뒤에는 아래 「저장하기」를 눌러 주세요.</p>
        {pinned.map((p) => (
          <div key={p.id} className="gm-post"><div><Link to={`/groups/${g.id}/posts/${p.id}`}>{p.title}</Link><small>고정됨 · {p.author} · {md(p.simDate)}</small></div><Chip tone="yellow" square>{p.category || '공지'}</Chip><Button size="sm" variant="outline" onClick={() => void post(p.id, 'unpin', '공지 고정을 해제했어요')}>고정 해제</Button></div>
        ))}
        {hiddenPosts.map((p) => (
          <div key={p.id} className="gm-post"><div><Link to={`/groups/${g.id}/posts/${p.id}`}>{p.title}</Link><small>운영진이 숨김 · {md(p.simDate)} · 관리자 확인 대기</small></div><Chip tone="red" square>숨김</Chip><Button size="sm" variant="outline" onClick={() => void post(p.id, 'unhide', '글을 다시 보이게 했어요 · 관리자 확인도 함께 닫혀요')}>다시 보이기</Button></div>
        ))}
        {pinned.length === 0 && hiddenPosts.length === 0 && <p className="gcamps-empty">고정한 글과 숨긴 글이 없어요</p>}
      </section>

      <section className="card gm-sec" aria-label="주최 캠페인">
        <h2>주최 캠페인</h2>
        <p className="field-hint">캠페인은 녹색전환연구소가 만들고, 이 모임이 주최 모임이 돼요. 참가 신청자는 이 모임에 자동으로 가입돼요.</p>
        {camps === null && <Spinner />}
        {camps && camps.length === 0 && <p className="gcamps-empty">주최하는 캠페인이 아직 없어요</p>}
        {camps && camps.map((c) => (
          <div key={c.id} className="gcamp">
            <div className="gcamp-main"><div className="gcamp-title"><Chip tone={STATUS_TONE[c.status] ?? 'gray'} square>{STATUS_LABEL[c.status] ?? c.status}</Chip><strong>{c.title}</strong></div><small>{campaignWhen(c)} · {c.participantCount}명 {c.status === 'scheduled' ? '알림 신청' : '참여'}</small></div>
            {c.type !== 'signature' && <Button size="sm" variant="outline" onClick={() => setDlg({ k: 'records', c })}>참가자 기록 보기</Button>}
            <Link to={`/campaigns/${c.id}`} className="link-btn">캠페인 보기 →</Link>
          </div>
        ))}
        <p className="field-hint">참가자 기록(출발점, 미션 기록)은 주최 모임 운영진도 볼 수 있어요. 연구소는 익명 집계만 써요.</p>
        <div className="gcollab"><span>우리 모임이 주최할 새 캠페인이 있나요?</span><button type="button" className="link-btn" onClick={() => setDlg({ k: 'collab' })}>캠페인 협업 제안하기 →</button></div>
      </section>

      <section className="card gm-sec" aria-label="모임 설정">
        <h2>모임 설정</h2>
        <dl className="ginfo"><dt>모임 이름</dt><dd>{g.name}</dd><dt>지역</dt><dd>{region}</dd></dl>
        <fieldset className="gm-policy"><legend className="field-label">가입 방식</legend>
          {(['open', 'approval', 'private'] as const).map((p) => (
            <label key={p}><input type="radio" name="gpolicy" checked={policy === p} onChange={() => setPolicy(p)} /> {POLICY_LABEL_LONG[p]}</label>
          ))}
        </fieldset>
        <label className="field"><span className="field-label">단톡방 링크</span>
          <input className="input" value={chat} placeholder="https://open.kakao.com/o/..." onChange={(e) => setChat(e.target.value)} />
          <span className="field-hint">가입한 멤버에게만 보여요.</span></label>
        <div className="gm-foot">
          {owner && <Button variant="outline" onClick={() => setDlg({ k: 'transfer' })} disabled={closed}>모임장 넘기기</Button>}
          {owner && <Button variant="outline" onClick={() => setDlg({ k: 'close' })} disabled={closed}>모임 닫기</Button>}
          <span className="post-spacer" />
          <Button onClick={() => void save()} disabled={closed}>저장하기</Button>
        </div>
        {!owner && <p className="field-hint">모임장 넘기기와 모임 닫기는 모임장만 할 수 있어요.</p>}
        {owner && g.pendingTransferTo && <p className="field-hint">모임장을 넘기는 요청이 수락을 기다리고 있어요. 7일 안에 수락하지 않으면 취소돼요.</p>}
      </section>

      {dlg?.k === 'staff' && (
        <Modal open onClose={() => setDlg(null)} title={`${dlg.m.nickname} 님을 운영진으로 지정할까요?`} description={`지정하면 ${dlg.m.nickname} 님에게 알림이 가요.`}
          footer={<><Button variant="ghost" pill onClick={() => setDlg(null)}>취소</Button><Button pill onClick={() => void member(dlg.m.userId, 'staff', `${dlg.m.nickname} 님을 운영진으로 지정했어요`)}>지정하기</Button></>}>
          <ul className="gm-list"><li>공지 쓰기와 고정</li><li>글 숨기기 · 가입 신청 승인</li><li>멤버 내보내기</li><li>주최 캠페인 참가자 기록 보기</li></ul>
          <p className="field-hint">모임 설정 변경과 모임 닫기는 모임장만 할 수 있어요.</p>
        </Modal>
      )}
      {dlg?.k === 'unstaff' && (
        <Modal open onClose={() => setDlg(null)} title="운영진에서 해제할까요?" description="멤버로 남고, 운영진 권한만 없어져요."
          footer={<><Button variant="ghost" pill onClick={() => setDlg(null)}>취소</Button><Button pill onClick={() => void member(dlg.m.userId, 'unstaff', '운영진에서 해제했어요')}>해제하기</Button></>} />
      )}
      {dlg?.k === 'kick' && <KickDialog m={dlg.m} onClose={() => setDlg(null)} onDo={(ban) => member(dlg.m.userId, ban ? 'ban' : 'kick', `${dlg.m.nickname} 님을 모임에서 내보냈어요`)} />}
      {dlg?.k === 'transfer' && <TransferDialog groupId={id} staff={rest.filter((m) => m.role === 'staff')} onClose={() => setDlg(null)} onDone={() => { setDlg(null); void loadGroup(); }} />}
      {dlg?.k === 'close' && <CloseDialog g={g} camps={camps ?? []} onClose={() => setDlg(null)} onDone={() => nav(`/groups/${g.id}`)} />}
      {dlg?.k === 'records' && <RecordsDialog groupId={id} c={dlg.c} onClose={() => setDlg(null)} />}
      {dlg?.k === 'collab' && <CollabModal groupId={id} onClose={() => setDlg(null)} />}
    </div>
  );
}

function KickDialog({ m, onClose, onDo }: { m: Member; onClose(): void; onDo(ban: boolean): void }) {
  const [ban, setBan] = useState(false);
  return (
    <Modal open onClose={onClose} title={`${m.nickname} 님을 내보낼까요?`} description="모임에서 나가게 되고, 단톡방 링크와 멤버 전용 글을 볼 수 없어요."
      footer={<><Button variant="ghost" pill onClick={onClose}>취소</Button><Button variant="danger" pill onClick={() => onDo(ban)}>내보내기</Button></>}>
      <ul className="gm-list"><li>쓴 글과 댓글은 남아요. 필요하면 게시판에서 따로 숨겨요.</li><li>진행 중인 주최 캠페인 참가는 유지돼요.</li></ul>
      <label className="gnew-check"><input type="checkbox" checked={ban} onChange={(e) => setBan(e.target.checked)} /> 다시 가입하지 못하게 막기</label>
    </Modal>
  );
}

function TransferDialog({ groupId, staff, onClose, onDone }: { groupId: string; staff: Member[]; onClose(): void; onDone(): void }) {
  const [to, setTo] = useState(staff[0]?.userId ?? '');
  const [busy, setBusy] = useState(false);
  const target = staff.find((s) => s.userId === to);
  const send = async () => {
    setBusy(true);
    try {
      await api(`/api/groups/${groupId}/transfer`, { body: { toUserId: to }, quiet: true });
      showToast(`${target?.nickname ?? ''} 님에게 모임장 수락을 요청했어요`);
      onDone();
    } catch (e) { showToast((e as Error).message || '요청하지 못했어요'); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="모임장 넘기기" description="운영진 중에서 고를 수 있어요. 넘기면 나는 운영진으로 남아요."
      footer={<><Button variant="ghost" pill onClick={onClose}>취소</Button><Button pill disabled={!to || busy} onClick={() => void send()}>수락 요청 보내기</Button></>}>
      {staff.length === 0 && <p className="field-hint">먼저 멤버를 운영진으로 지정해 주세요.</p>}
      <div className="gm-pick">
        {staff.map((s) => (
          <label key={s.userId} className={s.userId === to ? 'on' : undefined}><input type="radio" name="gto" checked={s.userId === to} onChange={() => setTo(s.userId)} /> <strong>{s.nickname}</strong> <small>운영진</small></label>
        ))}
      </div>
      <p className="field-hint">상대가 수락하면 넘어가요. 7일 안에 수락하지 않으면 취소돼요.</p>
    </Modal>
  );
}

function CloseDialog({ g, camps, onClose, onDone }: { g: GroupView; camps: Camp[]; onClose(): void; onDone(): void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const active = camps.find((c) => ['recruiting', 'running', 'scheduled'].includes(c.status));
  const send = async () => {
    try {
      await api(`/api/groups/${g.id}/close`, { body: { confirmName: name }, quiet: true });
      showToast('모임을 닫았어요');
      onDone();
    } catch (e) { setError((e as Error).message || '닫지 못했어요'); }
  };
  return (
    <Modal open danger onClose={onClose} title="모임을 닫을까요?" description="닫은 모임은 다시 열 수 없어요."
      footer={<><Button variant="ghost" pill onClick={onClose}>취소</Button><Button variant="danger" pill disabled={name !== g.name} onClick={() => void send()}>모임 닫기</Button></>}>
      <ul className="gm-list">
        <li>새 가입과 글쓰기가 멈춰요.</li>
        <li>게시판은 30일 동안 멤버에게 읽기 전용으로 남고, 그 뒤에는 보이지 않아요.</li>
        <li>모집 중이거나 진행 중인 주최 캠페인이 있으면 닫을 수 없어요.{active ? ` 지금은 「${active.title}」(${STATUS_LABEL[active.status]})가 있어요.` : ''}</li>
      </ul>
      <label className="field"><span className="field-label">확인을 위해 모임 이름을 입력해 주세요</span>
        <input className="input" value={name} placeholder={g.name} onChange={(e) => setName(e.target.value)} /></label>
      {error && <p className="field-error" role="alert">{error}</p>}
    </Modal>
  );
}

function RecordsDialog({ groupId, c, onClose }: { groupId: string; c: Camp; onClose(): void }) {
  const [rows, setRows] = useState<Array<{ nickname: string; startTotal: number | null; recordCount: number }> | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ items: NonNullable<typeof rows> }>(`/api/groups/${groupId}/campaigns/${c.id}/participants`, { quiet: true }).then((r) => alive && setRows(r.items)).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [groupId, c.id]);
  return (
    <Modal open onClose={onClose} width={640} title={`${c.title} · 참가자 기록`} description="개별 기록은 주최 모임 운영진과 녹색전환연구소만 봐요."
      footer={<Button variant="outline" pill onClick={onClose}>닫기</Button>}>
      {rows === null && <Spinner />}
      {rows && rows.length === 0 && <EmptyState title="아직 참가자가 없어요">모집이 시작되면 신청한 사람의 출발점이, 진행이 시작되면 미션 기록이 여기 보여요. 내려받기는 녹색전환연구소 관리자 화면에서만 할 수 있어요.</EmptyState>}
      {rows && rows.length > 0 && (
        <div className="gm-table">
          <div className="gm-row gm-th gm-row-3"><span>활동명</span><span>출발점</span><span>기록</span></div>
          {rows.map((r, i) => <div key={i} className="gm-row gm-row-3"><strong>{r.nickname}</strong><span>{r.startTotal != null ? `${r.startTotal.toFixed(1)}t` : '–'}</span><span>{r.recordCount}회</span></div>)}
        </div>
      )}
    </Modal>
  );
}
