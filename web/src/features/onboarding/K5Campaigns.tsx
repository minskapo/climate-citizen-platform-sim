import { useEffect, useState } from 'react';
import { koRange } from '@shared/date';
import { api } from '../../lib/api';
import { showToast } from '../../components/Toast';
import { Button, Chip, EmptyState } from '../../components/ui';
import { ApplySheet } from '../campaigns/ApplySheet';
import { ObFrame, Stepper, type Mode } from './OnboardingFlow';

interface Item {
  id: string; type: 'practice' | 'signature' | 'offline'; title: string; summary?: string; mode?: string;
  host: { type: 'group' | 'igt'; id?: string; name: string };
  schedule: { runStart?: string; runDays?: number; eventDate?: string; recruitEnd?: string };
  status: 'recruiting' | 'scheduled';
}
export interface AppliedCampaign { id: string; title: string; type: Item['type']; hostGroupId: string | null; hostName: string; startDate: string | null; signed: boolean }

const MODE_OF: Record<Item['type'], Mode> = { practice: 'online', offline: 'offline', signature: 'signature' };
const MODE_LABEL: Record<Mode, string> = { online: '온라인', offline: '동네에서 만나서', signature: '서명으로 목소리 내기' };
const MAX_SHOWN = 4;

export function recommend(items: Item[], sido: string, sigungu: string, modes: Mode[]): Array<Item & { reason: string | null }> {
  const score = (i: Item) => {
    let s = i.status === 'recruiting' ? 1 : 0;
    const wants = modes.includes(MODE_OF[i.type]) || (i.type === 'practice' && i.mode === 'online' && modes.includes('online'));
    if (wants) s += 4;
    const text = `${i.title} ${i.summary ?? ''} ${i.host.name}`;
    if ((sigungu && text.includes(sigungu.replace(/[시군구]$/, ''))) || (sido && text.includes(sido))) s += 3;
    return s;
  };
  return [...items]
    .map((i) => ({ ...i, reason: modes.includes(MODE_OF[i.type]) ? MODE_LABEL[MODE_OF[i.type]] : null, s: score(i) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_SHOWN);
}

const when = (i: Item) => {
  const s = i.schedule;
  if (s.runStart && s.runDays) return koRange(s.runStart, new Date(Date.parse(s.runStart) + (s.runDays - 1) * 86_400_000).toISOString().slice(0, 10));
  return s.eventDate ? koRange(s.eventDate, s.eventDate).split('–')[0] : '';
};

/** K-5 온보딩 2/3 · 캠페인 신청. 신청 · 서명은 공통 신청 창을 위에 띄우고 이 화면에 머문다. */
export function K5Campaigns({ sido, sigungu, modes, applied, onApplied, onPrev, onNext, onSkip }: {
  sido: string; sigungu: string; modes: Mode[]; applied: AppliedCampaign[]; onApplied(a: AppliedCampaign): void;
  onPrev(): void; onNext(): void; onSkip(): void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const [alerted, setAlerted] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all(['recruiting', 'scheduled'].map((s) => api<{ items: Item[] }>(`/api/campaigns?status=${s}`, { quiet: true }).then((r) => r.items ?? [])))
      .then(([a, b]) => alive && setItems([...a, ...b]))
      .catch(() => alive && (setFailed(true), setItems([])));
    api<{ items: Array<{ result: { total: number } }> }>('/api/me/measurements', { quiet: true })
      .then((r) => alive && r.items?.[0] && setTotal(r.items[0].result.total)).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const shown = items ? recommend(items, sido, sigungu, modes) : [];
  const isDone = (id: string) => applied.some((a) => a.id === id);
  const label = (i: Item) => (i.status === 'scheduled' ? '알림 받기' : i.type === 'signature' ? '서명하기' : '신청하기');

  return (
    <ObFrame skip={onSkip}>
      <Stepper step={2} />
      <h1>{total != null ? `${total.toFixed(1)}톤에서 출발하기 좋은 캠페인` : '출발하기 좋은 캠페인'}</h1>
      <p className="ob-lead">하나만 신청해도 충분해요. 신청한 캠페인에는 방금 계산한 결과가 출발점으로 연결돼요.</p>
      {items === null && <p className="ob-lead">불러오는 중…</p>}
      {items && shown.length === 0 && (
        <EmptyState title="아직 열린 캠페인이 없어요">{failed ? '목록을 불러오지 못했어요. ' : ''}건너뛰고 다음 단계로 가 볼까요?</EmptyState>
      )}
      <div className="ob-list">
        {shown.map((i) => {
          const done = isDone(i.id) || alerted.includes(i.id);
          const a = applied.find((x) => x.id === i.id);
          return (
            <div key={i.id} className={`ob-item${done ? ' on' : ''}`}>
              <div className="ob-thumb" aria-hidden="true" />
              <div className="ob-item-main">
                <div className="ob-chips">
                  <Chip tone={i.status === 'recruiting' ? 'solid' : 'yellow'}>{i.status === 'recruiting' ? '모집 중' : '모집 예정'}</Chip>
                  {i.reason && <Chip tone="yellow">{i.reason}</Chip>}
                </div>
                <strong>{i.title}</strong>
                <small>{i.host.name}{when(i) ? ` · ${when(i)}` : ''}</small>
              </div>
              {done ? <Chip tone="solid">✓ {a?.signed ? '서명했어요' : alerted.includes(i.id) ? '알림 받아요' : '신청했어요'}</Chip> : (
                <Button variant="outline" pill onClick={() => {
                  if (i.status === 'scheduled') { setAlerted((l) => [...l, i.id]); showToast('알림을 신청했어요'); } else setOpen(i);
                }}>{label(i)}</Button>
              )}
            </div>
          );
        })}
      </div>
      <div className="ob-nav">
        <button type="button" className="btn btn-ghost btn-md" onClick={onPrev}>← 이전</button>
        <Button size="lg" onClick={onNext}>다음</Button>
      </div>
      {open && (
        <ApplySheet
          campaignId={open.id}
          origin="elsewhere"
          onClose={() => setOpen(null)}
          onDone={() => onApplied({
            id: open.id, title: open.title, type: open.type, hostGroupId: open.host.type === 'group' ? open.host.id ?? null : null,
            hostName: open.host.name, startDate: open.schedule.runStart ?? open.schedule.eventDate ?? null, signed: open.type === 'signature',
          })}
        />
      )}
    </ObFrame>
  );
}
