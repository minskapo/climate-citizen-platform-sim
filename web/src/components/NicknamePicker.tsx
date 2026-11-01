import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Modal } from './Modal';
import { Button, EmptyState } from './ui';

export interface UserLite { id: string; nickname: string; sido: string; sigungu: string }

/** 이미 만든 활동명을 고르는 목록(비밀번호 없음). 체험 도구 막대와 로그인 화면이 함께 쓴다. */
export function NicknameList({ onPick, currentId }: { onPick(u: UserLite): void; currentId?: string | null }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<UserLite[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api<UserLite[]>(`/api/users?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal, quiet: true })
        .then((r) => { setList(r); setFailed(false); })
        .catch((e) => { if ((e as Error).name !== 'AbortError') setFailed(true); });
    }, q ? 250 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  return (
    <div className="picker">
      <input
        className="input"
        type="search"
        placeholder="활동명 찾기"
        aria-label="활동명 찾기"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="picker-list">
        {failed && <EmptyState title="목록을 불러오지 못했어요">잠시 후 다시 열어 주세요.</EmptyState>}
        {!failed && list === null && <p className="picker-note">불러오는 중…</p>}
        {!failed && list?.length === 0 && (
          <EmptyState title={q ? '맞는 활동명이 없어요' : '아직 만든 활동명이 없어요'}>새 활동명을 만들어 시작해 보세요.</EmptyState>
        )}
        {list?.map((u) => (
          <button key={u.id} type="button" className={`picker-item${u.id === currentId ? ' is-current' : ''}`} onClick={() => onPick(u)}>
            <span className="picker-avatar" aria-hidden="true">{[...u.nickname][0]}</span>
            <span className="picker-main">
              <span className="picker-name">{u.nickname}</span>
              <span className="picker-sub">{[u.sido, u.sigungu].filter(Boolean).join(' ') || '지역 없음'}</span>
            </span>
            {u.id === currentId && <span className="picker-tag">지금</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NicknamePicker({ open, onClose, onPick, currentId, onSignOut }: {
  open: boolean; onClose(): void; onPick(u: UserLite): void; currentId: string | null; onSignOut?(): void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="활동명 고르기"
      description="이미 만든 활동명으로 들어가요. 체험용이라 비밀번호는 없어요."
      footer={
        <>
          {currentId && onSignOut && <Button variant="ghost" pill onClick={onSignOut} className="mr-auto">로그아웃</Button>}
          <Button variant="outline" pill onClick={onClose}>취소</Button>
          <Link to="/signup" className="btn btn-primary btn-md btn-pill" onClick={onClose}>새 활동명 만들기</Link>
        </>
      }
    >
      {open && <NicknameList onPick={onPick} currentId={currentId} />}
    </Modal>
  );
}
