import { useEffect, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Button, Spinner } from '../../../components/ui';
import { api } from '../../../lib/api';
import { PickList } from './PickList';

interface GroupLite { id: string; name: string; sido: string; joinPolicy: 'open' | 'approval' | 'private'; memberCount?: number }
const POLICY: Record<GroupLite['joinPolicy'], string> = { open: '누구나', approval: '가입 승인', private: '비공개' };
const NONE = '__none__';

/** 주최 모임 고르기 (「연결하지 않음」 포함) */
export function HostGroupModal({ current, onClose, onPick }: {
  current: string | null; onClose(): void; onPick(g: { id: string; name: string } | null): void;
}) {
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<GroupLite[] | null>(null);
  const [sel, setSel] = useState<string>(current ?? NONE);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api<{ items: GroupLite[] }>(`/api/groups${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`, { quiet: true })
        .then((r) => alive && setGroups(r.items ?? []))
        .catch(() => alive && setGroups([]));
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const items = [
    { id: NONE, name: '연결하지 않음', sub: '주최: 녹색전환연구소 · 참가자 게시판은 캠페인 안에 생겨요' },
    ...(groups ?? []).map((g) => ({
      id: g.id, name: g.name,
      sub: [g.sido || '전국', POLICY[g.joinPolicy], g.memberCount !== undefined ? `${g.memberCount.toLocaleString('ko-KR')}명` : ''].filter(Boolean).join(' · '),
    })),
  ];

  return (
    <Modal
      open onClose={onClose} title="주최 모임 고르기" description="연결하면 참가 신청자가 이 모임에 자동으로 가입돼요."
      footer={<>
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button onClick={() => {
          if (sel === NONE) { onPick(null); return; }
          const g = groups?.find((x) => x.id === sel);
          onPick(g ? { id: g.id, name: g.name } : null);
        }}>선택</Button>
      </>}
    >
      <div className="picker">
        <input className="input" placeholder="⌕  모임 이름 검색" aria-label="모임 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {groups === null ? <Spinner /> : <PickList label="주최 모임" items={items} selected={[sel]} onSelect={setSel} />}
        <p className="picker-note">비공개 모임을 고르면 캠페인 신청자가 초대 없이 바로 가입돼요.</p>
      </div>
    </Modal>
  );
}
