import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { showToast } from '../../components/Toast';
import { Button, Chip, EmptyState } from '../../components/ui';
import type { AppliedCampaign } from './K5Campaigns';
import { ObFrame, Stepper } from './OnboardingFlow';

interface G { id: string; name: string; sido: string; joinPolicy: string; myRole: string | null; memberCount?: number }
const IN = ['owner', 'staff', 'member'];

/** K-6 온보딩 3/3 · 모임. 주최 모임은 자동 가입 상태로, 지역 모임은 하나 더 권한다. */
export function K6Groups({ sido, applied, onJoined, onPrev, onNext, onSkip }: {
  sido: string; applied: AppliedCampaign[]; onJoined(name: string): void; onPrev(): void; onNext(): void; onSkip(): void;
}) {
  const [groups, setGroups] = useState<G[] | null>(null);
  const [mine, setMine] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    api<{ items: G[] }>('/api/groups', { quiet: true }).then((r) => alive && setGroups(r.items ?? [])).catch(() => alive && setGroups([]));
    return () => { alive = false; };
  }, []);

  const hosts = applied.filter((a) => a.hostGroupId && a.type !== 'signature');
  const hostIds = new Set(hosts.map((h) => h.hostGroupId));
  const open = (groups ?? []).filter((g) => g.joinPolicy !== 'private' && !IN.includes(g.myRole ?? '') && !hostIds.has(g.id));
  const near = open.filter((g) => sido && g.sido === sido);
  const rec = (near.length ? near : open).slice(0, 2);

  const join = async (g: G) => {
    try {
      const r = await api<{ role: string }>(`/api/groups/${g.id}/join`, { method: 'POST', body: {}, quiet: true });
      setMine((l) => [...l, g.id]);
      if (r.role === 'member') onJoined(g.name);
      showToast(r.role === 'pending' ? '가입을 신청했어요 · 운영진이 확인하면 가입돼요' : '모임에 가입했어요');
    } catch (e) {
      showToast((e as Error).message || '가입하지 못했어요');
    }
  };

  return (
    <ObFrame skip={onSkip}>
      <Stepper step={3} />
      <h1>함께할 모임이에요</h1>
      <p className="ob-lead">캠페인이 끝나도 모임에서 이어 갈 수 있어요. 가입은 언제든 취소할 수 있어요.</p>
      {groups === null && <p className="ob-lead">불러오는 중…</p>}
      <div className="ob-list">
        {hosts.map((h) => (
          <div key={h.id} className="ob-item on">
            <div className="ob-thumb" aria-hidden="true" />
            <div className="ob-item-main"><strong>{h.hostName}</strong><small>{h.title}를 여는 모임이에요</small></div>
            <Chip tone="solid">캠페인 신청으로 자동 가입됨</Chip>
          </div>
        ))}
        {groups && rec.map((g) => (
          <div key={g.id} className={`ob-item${mine.includes(g.id) ? ' on' : ''}`}>
            <div className="ob-thumb" aria-hidden="true" />
            <div className="ob-item-main">
              <strong>{g.name}</strong>
              <small>{g.sido || '전국'}{g.memberCount != null ? ` · ${g.memberCount.toLocaleString('ko-KR')}명` : ''}</small>
            </div>
            {mine.includes(g.id) ? <Chip tone="solid">✓ 가입했어요</Chip> : <Button variant="outline" pill onClick={() => join(g)}>가입하기</Button>}
          </div>
        ))}
        {groups && !hosts.length && rec.length === 0 && <EmptyState title="권해 드릴 모임이 아직 없어요">모임 메뉴에서 천천히 둘러볼 수 있어요.</EmptyState>}
      </div>
      <div className="ob-nav">
        <button type="button" className="btn btn-ghost btn-md" onClick={onPrev}>← 이전</button>
        <Button size="lg" onClick={onNext}>시작하기</Button>
      </div>
    </ObFrame>
  );
}
