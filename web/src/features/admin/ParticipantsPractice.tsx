import { useMemo, useState } from 'react';
import { LoadError, Spinner } from '../../components/ui';
import { Button } from '../../components/ui';
import { addDays } from '@shared/date';
import { useSim } from '../../lib/sim';
import { md } from './editor/model';
import { ExportModal } from './ExportModal';
import { NoticeModal } from './NoticeModal';
import { FilterTabs, n, PartHead, pct, StatCards, useParticipants, type Part } from './participantsCommon';

type Tab = '' | 'no_start' | 'reminder_off' | 'no_record';

/** M-1a 캠페인 참가자 관리 (실천 캠페인) */
export function ParticipantsPractice({ id }: { id: string }) {
  const sim = useSim();
  const { campaign, data, failed, reload } = useParticipants(id);
  const [tab, setTab] = useState<Tab>('');
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState(false);
  const [exp, setExp] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const f: Record<Tab, (r: Part) => boolean> = {
      '': () => true, no_start: (r) => r.startTotal === null, reminder_off: (r) => !r.reminderOn, no_record: (r) => r.recordCount === 0,
    };
    const k = q.trim().toLowerCase();
    return data.items.filter((r) => r.state !== 'waitlisted' && r.state !== 'cancelled' && f[tab](r) && (!k || r.nickname.toLowerCase().includes(k) || r.region.toLowerCase().includes(k)));
  }, [data, tab, q]);

  if (failed) return <LoadError onRetry={() => void reload()} />;
  if (!campaign || !data) return <Spinner />;
  const c = campaign.campaign;
  const k = data.counts;
  const weekAgo = addDays(sim.today, -6);
  const thisWeek = data.items.filter((r) => r.appliedOn >= weekAgo && r.appliedOn <= sim.today).length;
  const s = c.schedule;

  return (
    <div>
      <PartHead
        campaign={campaign} titleSuffix="참가자"
        sub={`${c.host.name} 주최${s.runStart ? ` · 진행 ${md(s.runStart)}${s.runDays ? `–${md(addDays(s.runStart, s.runDays - 1))}` : ''}` : ''} · 개별 기록은 운영자와 주최 모임 운영진만 봐요.`}
        actions={<>
          <Button variant="outline" pill onClick={() => setNotice(true)}>공지 보내기</Button>
          <Button variant="outline" pill onClick={() => setExp(true)}>내려받기</Button>
        </>}
      />
      <StatCards cards={[
        { label: '신청', value: `${n(k.all)}명`, note: `이번 주 +${n(thisWeek)}` },
        { label: '출발점 있음', value: `${n(k.withStart)}명`, note: `${pct(k.withStart, k.all)}%${k.avgStart != null ? ` · 평균 ${k.avgStart.toFixed(1)}톤` : ''}` },
        { label: '체크리스트 완료', value: `${n(k.checklistComplete)}명`, note: `${pct(k.checklistComplete, k.all)}%` },
        { label: '연구 활용 동의', value: `${n(k.research)}명`, note: `${pct(k.research, k.all)}% · 익명 집계 대상` },
      ]} />
      <div className="adm-toolbar">
        <FilterTabs<Tab> value={tab} onChange={setTab} tabs={[
          ['', `전체 ${n(k.all)}`], ['no_start', `출발점 없음 ${n(k.noStart)}`], ['reminder_off', `알림 끔 ${n(k.reminderOff)}`], ['no_record', `시작 후 기록 없음 ${n(k.noRecord)}`],
        ]} />
        <input className="input adm-search" placeholder="⌕  활동명 검색" aria-label="활동명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="adm-table-wrap card adm-table-card">
        <table className="adm-table">
          <thead><tr><th>활동명</th><th>지역</th><th>신청일</th><th>출발점</th><th>알림</th><th>체크리스트</th><th>연구 동의</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="adm-strong">{r.nickname}</td>
                <td>{r.region || '–'}</td>
                <td>{md(r.appliedOn)}</td>
                <td>{r.startTotal != null ? `${r.startTotal}톤` : '없음'}</td>
                <td>{r.reminderOn ? '켬' : '끔'}</td>
                <td>{r.checklistDone} / {campaign.checklist.length || 4}</td>
                <td>{r.research ? '동의' : '–'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="adm-empty">조건에 맞는 참가자가 없어요</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="adm-muted adm-foot-note">연락처는 이 화면에 보이지 않아요. 참가자에게 연락할 때는 「공지 보내기」로 앱 알림을 보내요.</p>
      {notice && (
        <NoticeModal campaignId={id} onClose={() => setNotice(false)} onSent={() => void reload()} targets={[
          { key: 'all', label: '전체', count: k.all }, { key: 'no_start', label: '출발점 없음', count: k.noStart },
          { key: 'reminder_off', label: '알림 끔', count: k.reminderOff }, { key: 'no_record', label: '시작 후 기록 없음', count: k.noRecord },
        ]} />
      )}
      {exp && <ExportModal campaignId={id} researchCount={k.research} onClose={() => setExp(false)} />}
    </div>
  );
}
