import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { missionForDate } from '@shared/missions';
import { useSim } from '../../lib/sim';
import { api } from '../../lib/api';
import { share } from '../../lib/share';
import { Button } from '../../components/ui';
import { BlockSlotView } from '../campaigns/BlockSlotView';
import { GroupCard } from '../groups/GroupCard';
import type { GroupView } from '../groups/types';
import { phaseFor, runEndOf, runLength, type CampaignDetail } from '../campaigns/types';
import { unitOf } from './RecordCalendar';
import { ReviewForm } from './ReviewForm';
import { downloadMyRecords, mdOf, type usePracticeData } from './usePractice';
import '../groups/groups.css';

type Data = ReturnType<typeof usePracticeData>;

/** 분류별 기록률: 분류마다 기록한 차례 / 전체 차례 */
export function categoryRates(detail: CampaignDetail, slots: string[], recorded: string[]) {
  const c = detail.campaign;
  const rec = new Set(recorded);
  const out = new Map<string, { done: number; total: number }>();
  for (const d of slots) {
    const m = missionForDate(detail.missions, c.settings.missionCycle ?? 'daily', c.schedule.runStart!, d, c.schedule.runDays ?? undefined);
    const k = m?.category || '기록';
    const v = out.get(k) ?? { done: 0, total: 0 };
    v.total++;
    if (rec.has(d)) v.done++;
    out.set(k, v);
  }
  return [...out.entries()];
}

function NextGroups({ excludeId }: { excludeId?: string }) {
  const [groups, setGroups] = useState<GroupView[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ items: GroupView[] }>('/api/groups', { quiet: true })
      .then((r) => alive && setGroups((r.items ?? []).filter((g) => g.id !== excludeId && g.joinPolicy !== 'private' && !g.closed)
        .sort((a, b) => (b.newPostsThisWeek ?? 0) - (a.newPostsThisWeek ?? 0)).slice(0, 3)))
      .catch(() => alive && setGroups([]));
    return () => { alive = false; };
  }, [excludeId]);
  if (!groups || groups.length === 0) return null;
  return (
    <section aria-label="이제 동네 모임에서 이어 가요">
      <h2 className="csec-title">이제 동네 모임에서 이어 가요</h2>
      <p className="csec-sub">캠페인은 끝나도 실천은 계속돼요. 가까운 모임에 가입하면 다음 공동실천과 캠페인 소식을 받을 수 있어요.</p>
      <div className="gcards gcards-3">{groups.map((g) => <GroupCard key={g.id} g={g} />)}</div>
    </section>
  );
}

/** H-4 마무리: 기간 마지막 날부터 */
export function FinalView({ detail, data }: { detail: CampaignDetail; data: Data }) {
  const sim = useSim();
  const nav = useNavigate();
  const c = detail.campaign;
  const r = data.records;
  const unit = unitOf(detail);
  const runDays = c.schedule.runDays ?? 0;
  const lastDay = phaseFor(c, sim.today) === 'final';
  const startOn = !!c.settings.startPoint?.enabled;
  const done = r?.progress.done ?? 0;
  const total = r?.progress.total ?? 0;
  const s = data.start;
  const e = data.end;
  const diff = s && e ? e.result.total - s.result.total : null;
  const year = (c.schedule.runStart ?? sim.today).slice(0, 4);
  const end = runEndOf(c);

  return (
    <div className="cdetail">
      <div className="cdetail-main">
        <section className="cbanner" aria-label="마무리">
          <div>
            <h2>{runDays ? runLength(runDays) : '캠페인'}{runDays % 7 === 0 ? '를' : '을'} 함께 마쳤어요!</h2>
            <p>{c.settings.recordEnabled === false ? '' : `${total}${unit} 중 ${done}${unit}을 기록했어요. `}{startOn && lastDay && !e ? '마지막으로 다시 재서 얼마나 줄었는지 확인해 보세요.' : ''}</p>
          </div>
          {startOn && lastDay && (
            <Button variant="outline" size="lg" className="cbanner-btn" onClick={() => nav(`/calculator?from=campaign&campaignId=${c.id}&kind=end`)}>
              {c.settings.startPoint?.toolId === 'calculator' ? '1.5도 계산기로 다시 재기' : '출발점 도구로 다시 재기'}
            </Button>
          )}
        </section>
        <BlockSlotView campaignId={c.id} screen="final" slot="top" />
        {(startOn || (r && r.slots.length > 0)) && (
          <section className="card cresult" aria-label={`${runLength(runDays)} 결과`}>
            <h2>{runLength(runDays)} 결과</h2>
            {startOn && (
              <div className="cresult-cmp">
                <div className="cresult-box"><small>시작</small><strong>{s ? `${s.result.total.toFixed(1)}톤` : '—'}</strong><small>{s ? mdOf(s.simDate) : '재지 않았어요'}</small></div>
                <span className="cresult-arrow" aria-hidden="true">→</span>
                <div className="cresult-box"><small>마무리</small><strong className="is-green">{e ? `${e.result.total.toFixed(1)}톤` : '—'}</strong><small>{e ? mdOf(e.simDate) : lastDay ? '오늘 다시 재요' : '재지 않았어요'}</small></div>
                <div className="cresult-box cresult-diff"><small>{diff != null && diff > 0 ? '늘어난 양' : '줄인 양'}</small><strong>{diff == null ? '—' : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toFixed(1)}톤`}</strong></div>
              </div>
            )}
            {r && r.slots.length > 0 && (
              <div className="cresult-cats">
                {categoryRates(detail, r.slots, r.records.map((x) => x.slotDate)).map(([k, v]) => (
                  <div key={k} className="cresult-cat"><small>{k}</small><strong>{v.done} / {v.total}{unit}</strong></div>
                ))}
              </div>
            )}
          </section>
        )}
        <BlockSlotView campaignId={c.id} screen="final" slot="after_common" />
        <BlockSlotView campaignId={c.id} screen="final" slot="bottom" />
        <ReviewForm detail={detail} />
        <NextGroups excludeId={c.host.id} />
      </div>
      <aside className="cdetail-side">
        <section className="card cfinish" aria-label="완주 기록">
          <span className="cfinish-badge" aria-hidden="true">1.5</span>
          <h2>완주 기록</h2>
          <p>{year} {c.title}{c.settings.recordEnabled === false ? '' : ` · ${done} / ${total}${unit}`}{end ? ` · ${mdOf(end)} 마침` : ''}</p>
          <div className="cfinish-btns">
            <Button variant="outline" disabled={!r} onClick={() => r && downloadMyRecords(detail, r)}>내 기록 내려받기</Button>
            <Button variant="outline" onClick={() => share(`/campaigns/${c.id}`, c.title)}>공유하기</Button>
          </div>
        </section>
        {c.host.type === 'group' && (
          <section className="cstay" aria-label="주최 모임">
            <strong>{c.host.name}에 남아 있어요</strong>
            <p>동네 모임이 없다면 여기서 계속 기록을 나눠요. 원하면 언제든 탈퇴할 수 있어요.</p>
          </section>
        )}
      </aside>
    </div>
  );
}
