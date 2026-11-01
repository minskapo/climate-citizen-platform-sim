import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Modal } from './Modal';
import { Button, EmptyState } from './ui';

interface GroupLite { id: string; name: string; sido: string; sigungu: string; myRole: string | null; closed: boolean }
const ROLE_LABEL: Record<string, string> = { owner: '모임장', staff: '운영진', member: '멤버' };
const isMine = (g: GroupLite) => !!g.myRole && g.myRole in ROLE_LABEL;

async function loadGroups(): Promise<GroupLite[]> {
  const out: GroupLite[] = [];
  let cursor: string | null = '0';
  for (let i = 0; i < 5 && cursor !== null; i++) {
    const r: { items: GroupLite[]; nextCursor: string | null } = await api(`/api/groups?cursor=${cursor}`, { quiet: true });
    out.push(...r.items);
    cursor = r.nextCursor;
  }
  return out.filter((g) => !g.closed);
}

/** 「운영할 모임 고르기」: 가입한 모임을 먼저 보여 준다. 가입한 모임이 없으면 모든 모임에서 고른다. */
export function GroupPicker({ open, onClose, onPick, currentId }: { open: boolean; onClose(): void; onPick(id: string): void; currentId: string | null }) {
  const [groups, setGroups] = useState<GroupLite[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setGroups(null);
    setFailed(false);
    loadGroups().then((g) => alive && setGroups(g)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [open]);

  const mine = groups?.filter(isMine) ?? [];
  const shown = mine.length ? mine : groups ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="운영할 모임 고르기"
      description="고른 모임의 운영진 권한을 바로 받아요. 모임장 넘기기 · 모임 닫기는 실제 모임장만 할 수 있어요."
      footer={<Button variant="outline" pill onClick={onClose}>취소</Button>}
    >
      <div className="picker-list">
        {failed && <EmptyState title="모임 목록을 불러오지 못했어요">잠시 후 다시 열어 주세요.</EmptyState>}
        {!failed && groups === null && <p className="picker-note">불러오는 중…</p>}
        {groups && groups.length === 0 && <EmptyState title="아직 열린 모임이 없어요">회원으로 모임을 먼저 열어 보세요.</EmptyState>}
        {groups && groups.length > 0 && mine.length === 0 && <p className="picker-note">가입한 모임이 없어서 모든 모임을 보여 드려요.</p>}
        {shown.map((g) => (
          <button key={g.id} type="button" className={`picker-item${g.id === currentId ? ' is-current' : ''}`} onClick={() => onPick(g.id)}>
            <span className="picker-avatar" aria-hidden="true">{[...g.name][0]}</span>
            <span className="picker-main">
              <span className="picker-name">{g.name}</span>
              <span className="picker-sub">{[g.sido, g.sigungu].filter(Boolean).join(' ') || '전국'}</span>
            </span>
            {g.myRole && ROLE_LABEL[g.myRole] && <span className="picker-tag">{ROLE_LABEL[g.myRole]}</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}
