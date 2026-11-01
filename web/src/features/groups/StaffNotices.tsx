import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { addDays } from '@shared/date';

interface M { role: string; joinedOn: string }
interface P { hidden: boolean }

/** G-1 상단 「운영진에게만 보여요」 알림 줄. */
export function StaffNotices({ groupId, reloadKey = 0 }: { groupId: string; reloadKey?: number }) {
  const sim = useSim();
  const [newMembers, setNewMembers] = useState(0);
  const [pending, setPending] = useState(0);
  const [hidden, setHidden] = useState(0);

  useEffect(() => {
    let alive = true;
    api<{ items: M[] }>(`/api/groups/${groupId}/members`, { quiet: true })
      .then((r) => {
        if (!alive) return;
        const from = addDays(sim.today, -7);
        setNewMembers(r.items.filter((m) => m.role !== 'pending' && m.joinedOn > from).length);
        setPending(r.items.filter((m) => m.role === 'pending').length);
      }).catch(() => undefined);
    api<{ items: P[] }>(`/api/boards/group/${groupId}/posts`, { quiet: true })
      .then((r) => alive && setHidden(r.items.filter((p) => p.hidden).length)).catch(() => undefined);
    return () => { alive = false; };
  }, [groupId, sim.today, reloadKey]);

  return (
    <div className="gstaff">
      <span className="gstaff-tag">운영진에게만 보여요</span>
      <span>이번 주 새 멤버 {newMembers}명</span>
      {pending > 0 && <span>가입 신청 {pending}명</span>}
      <span>숨긴 글 {hidden}개</span>
      <Link to={`/groups/${groupId}/manage`} className="gstaff-go">모임 관리 →</Link>
    </div>
  );
}
