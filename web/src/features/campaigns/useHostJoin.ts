import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { showToast } from '../../components/Toast';
import type { CampaignDetail } from './types';

/**
 * 「주최 모임 소식 받기」: 주최 모임이 있는 캠페인에서 그 모임에 가입한다.
 * 가입 신청을 받을 수 없는 모임(비공개 · 닫힘 · 내보낸 회원)이면 canJoin이 false.
 */
export function useHostJoin(detail: CampaignDetail) {
  const sim = useSim();
  const nav = useNavigate();
  const c = detail.campaign;
  const hostId = c.host.type === 'group' && c.host.id ? c.host.id : null;
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [joinable, setJoinable] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!hostId) { setRole(null); return; }
    let alive = true;
    const signedIn = !!sim.userId && sim.role !== 'guest';
    api<{ myRole: string | null; joinPolicy?: string; closed?: boolean }>(`/api/groups/${hostId}`, { quiet: true })
      .then((g) => {
        if (!alive) return;
        const myRole = signedIn ? g.myRole : null;
        setRole(myRole);
        setJoinable(g.joinPolicy !== 'private' && !g.closed && myRole !== 'banned');
      })
      .catch(() => { if (alive) { setRole(null); setJoinable(false); } });
    return () => { alive = false; };
  }, [hostId, sim.userId, sim.role]);
  const inGroup = !!role && ['owner', 'staff', 'member'].includes(role);
  const pending = role === 'pending';
  const join = async () => {
    if (!hostId) return;
    if (!sim.userId || sim.role === 'guest') { showToast('가입하면 모임 소식을 받을 수 있어요'); nav('/signup'); return; }
    setBusy(true);
    try {
      const r = await api<{ role: string }>(`/api/groups/${hostId}/join`, { method: 'POST', body: {}, quiet: true });
      setRole(r.role);
      showToast(r.role === 'pending' ? '가입을 신청했어요. 운영진이 승인하면 가입돼요' : '주최 모임에 가입했어요');
    } catch (e) {
      showToast((e as Error).message || '가입하지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  return { hostId, inGroup, pending, canJoin: role !== undefined && joinable && !inGroup && !pending, busy, join };
}
