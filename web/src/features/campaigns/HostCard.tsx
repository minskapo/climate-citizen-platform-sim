import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Host } from './types';

interface GroupInfo { id: string; name: string; sido: string; joinPolicy: string; memberCount?: number; myRole: string | null }
const POLICY: Record<string, string> = { open: '누구나', approval: '가입 승인', private: '비공개' };
const IN = ['owner', 'staff', 'member'];

/** 주최 모임 카드. 연결한 모임이 없으면 녹색전환연구소로 보여 준다. */
export function HostCard({ host, compact }: { host: Host; compact?: boolean }) {
  const [g, setG] = useState<GroupInfo | null>(null);
  useEffect(() => {
    if (host.type !== 'group' || !host.id) { setG(null); return; }
    let alive = true;
    api<GroupInfo>(`/api/groups/${host.id}`, { quiet: true }).then((r) => alive && setG(r)).catch(() => undefined);
    return () => { alive = false; };
  }, [host.type, host.id]);

  const members = g?.memberCount != null ? `${g.memberCount.toLocaleString('ko-KR')}명` : '';
  const sub = host.type === 'igt'
    ? '캠페인을 만들고 운영해요'
    : compact
      ? [g && IN.includes(g.myRole ?? '') ? '가입됨' : null, members].filter(Boolean).join(' · ')
      : [g ? g.sido || '전국' : null, g ? POLICY[g.joinPolicy] : null, members].filter(Boolean).join(' · ');
  return (
    <section className="card chost" aria-label="주최 모임">
      <p className="chost-label">주최 모임</p>
      <div className="chost-row">
        <span className="chost-avatar" aria-hidden="true">{[...host.name][0]}</span>
        <div>
          <strong>{host.name}</strong>
          {sub && <p className="chost-sub">{sub}</p>}
        </div>
      </div>
      {host.type === 'group' && host.id && <Link to={`/groups/${host.id}`} className="link-btn">모임 보기 →</Link>}
    </section>
  );
}
