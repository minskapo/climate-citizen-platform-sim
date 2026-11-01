import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { CollabModal } from '../collab/CollabModal';
import { SIDO_LIST } from '../auth/regions';
import { POLICY_LABEL, type GroupView, type JoinPolicy } from './types';
import './groups.css';

const DEFAULT_CATS = ['공지', '자료', '활동 기록', '후기', '자유'];
const POLICY_HELP: Record<JoinPolicy, string> = {
  open: '누구나 바로 가입하고 글을 볼 수 있어요.',
  approval: '운영진이 승인해야 가입돼요. 글 목록은 공개돼요.',
  private: '초대받은 사람만 들어올 수 있어요. 목록에는 이름만 보여요.',
};

/** J 새 모임 만들기 */
export function NewGroupPage() {
  const sim = useSim();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [national, setNational] = useState(false);
  const [sido, setSido] = useState<string>('');
  const [sigungu, setSigungu] = useState('');
  const [policy, setPolicy] = useState<JoinPolicy>('open');
  const [cats, setCats] = useState<string[]>(DEFAULT_CATS);
  const [newCat, setNewCat] = useState('');
  const [chat, setChat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [collab, setCollab] = useState(false);

  if (sim.role === 'guest' || !sim.userId) {
    return (
      <div className="container page">
        <h1 className="page-title">새 모임 만들기</h1>
        <EmptyState title="모임은 가입한 분이 열 수 있어요" action={<Link className="btn btn-primary btn-md" to="/login">로그인 · 가입하기</Link>}>
          로그인하면 모임을 열고 모임장이 될 수 있어요.
        </EmptyState>
      </div>
    );
  }

  const region = national || !sido ? '전국·온라인' : sido;
  const addCat = () => {
    const c = newCat.trim();
    if (!c) return;
    if ([...c].length > 12) { setError('분류 이름은 12자까지 쓸 수 있어요'); return; }
    if (cats.includes(c)) { setNewCat(''); return; }
    if (cats.length >= 10) { setError('분류는 10개까지 만들 수 있어요'); return; }
    setCats([...cats, c]);
    setNewCat('');
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError('모임 이름을 써 주세요'); return; }
    setBusy(true);
    try {
      const g = await api<GroupView>('/api/groups', {
        body: { name: name.trim(), description: desc.trim(), sido: region, sigungu: national ? '' : sigungu.trim(), joinPolicy: policy, categories: cats, chatLink: chat.trim() },
        quiet: true,
      });
      showToast('모임을 열었어요');
      nav(`/groups/${g.id}`);
    } catch (e) {
      setError((e as Error).message || '모임을 열지 못했어요');
      setBusy(false);
    }
  };

  return (
    <div className="container page gnew">
      <nav className="crumbs" aria-label="현재 위치"><Link to="/groups">모임</Link> › <span>새 모임 만들기</span></nav>
      <h1 className="page-title">새 모임 만들기</h1>
      <p className="glist-lead">모임은 누구나 열 수 있어요. 만든 사람이 모임장이 되고, 나중에 운영진을 더할 수 있어요.</p>
      <div className="gnew-body">
        <div className="gnew-form">
          <section className="card gnew-sec">
            <h2><span>1</span> 기본 정보</h2>
            <label className="field"><span className="field-label">모임 이름 <small>{[...name].length} / 30</small></span>
              <input className="input" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="field"><span className="field-label">한 줄 소개 <small>{[...desc].length} / 60</small></span>
              <input className="input" maxLength={60} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
          </section>
          <section className="card gnew-sec">
            <h2><span>2</span> 지역</h2>
            <p className="field-hint">모임 목록의 지역 필터와 우리 동네 추천에 쓰여요. 카드에는 광역 단위(예: 강원)로 표시돼요.</p>
            <div className="gnew-row">
              <select className="input" aria-label="광역 지역" disabled={national} value={sido} onChange={(e) => setSido(e.target.value)}>
                <option value="">광역 고르기</option>{SIDO_LIST.map((s) => <option key={s}>{s}</option>)}
              </select>
              <input className="input" aria-label="시·군·구" disabled={national} placeholder="시·군·구" value={sigungu} onChange={(e) => setSigungu(e.target.value)} />
            </div>
            <label className="gnew-check"><input type="checkbox" checked={national} onChange={(e) => setNational(e.target.checked)} /> 지역 없이 전국 · 온라인 모임으로 만들기</label>
          </section>
          <section className="card gnew-sec">
            <h2><span>3</span> 가입 방식</h2>
            <div className="gnew-policies" role="radiogroup" aria-label="가입 방식">
              {(['open', 'approval', 'private'] as const).map((p) => (
                <label key={p} className={`gnew-policy${policy === p ? ' on' : ''}`}>
                  <input type="radio" name="policy" checked={policy === p} onChange={() => setPolicy(p)} />
                  <strong>{p === 'private' ? '비공개 (초대)' : p === 'open' ? '누구나' : POLICY_LABEL[p]}</strong>
                  <small>{POLICY_HELP[p]}</small>
                </label>
              ))}
            </div>
          </section>
          <section className="card gnew-sec">
            <h2><span>4</span> 게시판 분류</h2>
            <p className="field-hint">기본 분류로 시작하고, 만든 뒤에도 바꿀 수 있어요.</p>
            <div className="gcats">
              {cats.map((c) => (
                <span key={c} className="gcat">{c}{c !== '공지' && <button type="button" aria-label={`${c} 빼기`} onClick={() => setCats(cats.filter((x) => x !== c))}>✕</button>}</span>
              ))}
            </div>
            <div className="gnew-row">
              <input className="input" aria-label="새 분류 이름" placeholder="+ 분류 추가" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } }} />
              <Button variant="outline" onClick={addCat}>추가</Button>
            </div>
            <p className="field-hint">「공지」는 운영진만 쓸 수 있어요. 캠페인을 주최하면 캠페인 게시판이 자동으로 생겨요.</p>
          </section>
          <section className="card gnew-sec">
            <h2><span>5</span> 단톡방 연결 (선택)</h2>
            <p className="field-hint">실시간 대화는 단톡방에서, 남겨야 할 기록은 모임 게시판에서 나눠요.</p>
            <label className="field"><span className="field-label">오픈채팅방 링크</span>
              <input className="input" placeholder="https://open.kakao.com/o/..." value={chat} onChange={(e) => setChat(e.target.value)} />
              <span className="field-hint">가입한 구성원에게만 링크가 보여요.</span></label>
          </section>
          <section className="card gnew-sec">
            <h2><span>6</span> 운영진</h2>
            <p className="field-hint">모임을 연 뒤 「모임 관리」에서 멤버를 운영진으로 지정할 수 있어요.</p>
          </section>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="gnew-foot">
            <Button variant="ghost" pill onClick={() => nav('/groups')}>취소</Button>
            <Button pill size="lg" disabled={busy} onClick={() => void submit()}>모임 만들기</Button>
          </div>
        </div>
        <aside className="gnew-side">
          <div className="card">
            <h2 className="gside-title">카드 미리보기</h2>
            <div className="gcard gcard-static">
              <div className="gcard-top"><span className="gcard-avatar" aria-hidden="true">{[...(name || '모')][0]}</span><span className={`gcard-tag gcard-tag-${policy}`}>{region} · {policy === 'private' ? '비공개' : POLICY_LABEL[policy]}</span></div>
              <h3 className="gcard-name">{name || '모임 이름'}</h3>
              <p className="gcard-desc">{desc || '한 줄 소개가 여기에 보여요.'}</p>
              <p className="gcard-stat">1명 · 이번 주 새 글 0개</p>
              <div className="gcard-foot"><span className="gcard-none">열린 캠페인 없음</span></div>
            </div>
          </div>
          <div className="card gnew-notes">
            <h2 className="gside-title">모임을 열기 전에</h2>
            <ul>
              <li>개별 기록은 본인과 운영진만 볼 수 있어요.</li>
              <li>공개 모임의 글은 「모임 인기 게시물」에 소개될 수 있어요.</li>
              <li>만든 모임은 모임 목록에 바로 보여요. 모임장은 언제든 정보를 고칠 수 있어요.</li>
            </ul>
            <button type="button" className="link-btn" onClick={() => setCollab(true)}>캠페인 협업 제안 →</button>
          </div>
        </aside>
      </div>
      {collab && <CollabModal onClose={() => setCollab(false)} />}
    </div>
  );
}
