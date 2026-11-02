import { useMemo, useState } from 'react';
import { councilOf } from '@shared/text';
import { addDays } from '@shared/date';
import { Button, LoadError, Spinner } from '../../components/ui';
import { useSim } from '../../lib/sim';
import { DeliveryListModal } from './DeliveryListPrint';
import { DeliveryResultForm } from './DeliveryResultForm';
import { md } from './editor/model';
import { NoticeModal } from './NoticeModal';
import { FilterTabs, n, PartHead, pct, regionText, StatCards, useParticipants, type Part } from './participantsCommon';

/** 「{시군구}의회」, 시군구가 없으면 「{시도}의회」 */
const councilOfPart = (p: Pick<Part, 'region' | 'sigungu'>) => councilOf(p.region, p.sigungu);
const JOIN: Record<Part['hostJoin'], string> = { joined: '가입됨', pending: '승인 대기', none: '신청 안 함' };

/** M-1s 서명자 관리 */
export function SignersPage({ id }: { id: string }) {
  const sim = useSim();
  const [tab, setTab] = useState('');
  const { campaign, data, failed, reload } = useParticipants(id, tab === 'cancelled' ? 'cancelled' : '');
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState(false);
  const [list, setList] = useState(false);
  const [answer, setAnswer] = useState(false);

  const signers = useMemo(() => (data?.items ?? []).filter((r) => r.state === 'signed'), [data]);
  const topRegions = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of signers) m.set(r.region || '지역 미입력', (m.get(r.region || '지역 미입력') ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  }, [signers]);
  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    const base = tab === 'cancelled' ? data?.items ?? [] : signers.filter((r) => !tab.startsWith('r:') || (r.region || '지역 미입력') === tab.slice(2));
    return base.filter((r) => !k || r.nickname.toLowerCase().includes(k) || regionText(r).toLowerCase().includes(k));
  }, [data, signers, tab, q]);

  if (failed) return <LoadError onRetry={() => void reload()} />;
  if (!campaign || !data) return <Spinner />;
  const c = campaign.campaign;
  const s = c.schedule;
  const goal = (c.settings as { goal?: number }).goal ?? 0;
  const places = new Set(signers.map((r) => regionText(r) || '–')).size;
  const weekAgo = addDays(sim.today, -6);
  const thisWeek = signers.filter((r) => r.appliedOn >= weekAgo && r.appliedOn <= sim.today).length;
  const hostReq = signers.filter((r) => r.hostJoin !== 'none').length;
  const pending = signers.filter((r) => r.hostJoin === 'pending').length;
  const councils = [...signers.reduce((m, r) => m.set(councilOfPart(r), (m.get(councilOfPart(r)) ?? 0) + 1), new Map<string, number>()).entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'));

  return (
    <div>
      <PartHead
        campaign={campaign} titleSuffix="서명자"
        sub={`${c.host.name} 주최 · 서명 ${s.recruitStart ? md(s.recruitStart) : ''}${s.recruitEnd ? `–${md(s.recruitEnd)}` : ''} · 활동명과 지역은 운영자와 전달처만 봐요.`}
        actions={<>
          <Button variant="outline" pill onClick={() => setNotice(true)}>공지 보내기</Button>
          <Button variant="outline" pill onClick={() => setAnswer(true)}>의회 답변 올리기</Button>
          <Button variant="outline" pill onClick={() => setList(true)}>전달용 명단 만들기</Button>
        </>}
      />
      <StatCards cards={[
        { label: '서명', value: `${n(signers.length)}명`, note: `이번 주 +${n(thisWeek)}` },
        { label: '목표 달성률', value: goal ? `${pct(signers.length, goal)}%` : '–', note: goal ? `목표 ${n(goal)}명` : '목표 없음' },
        { label: '서명이 모인 지역', value: `${n(places)}곳`, note: '시 · 군 · 구 기준' },
        { label: '주최 모임 가입 신청', value: `${n(hostReq)}명`, note: `${pct(hostReq, signers.length)}% · 운영진 승인 대기 ${n(pending)}명` },
      ]} />
      <div className="adm-toolbar">
        <FilterTabs<string> value={tab} onChange={setTab} tabs={[
          ['', `전체 ${n(signers.length)}`],
          ...topRegions.map(([r, k]): [string, string] => [`r:${r}`, `${r} ${n(k)}`]),
          ['cancelled', `서명 취소 ${n(data.counts.cancelled)}`],
        ]} />
        <input className="input adm-search" placeholder="⌕  활동명 · 지역 검색" aria-label="활동명 · 지역 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="adm-table-wrap card adm-table-card">
        <table className="adm-table">
          <thead><tr><th>활동명</th><th>사는 지역</th><th>서명일</th><th>전달할 의회</th><th>모임 가입</th><th>공유로 온 서명</th><th>연구 동의</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="adm-strong">{r.nickname}</td>
                <td>{regionText(r) || '–'}</td>
                <td>{md(r.appliedOn)}</td>
                <td>{councilOfPart(r)}</td>
                <td>{JOIN[r.hostJoin]}</td>
                <td>{n(r.sharedCount)}명</td>
                <td>{r.research ? '동의' : '–'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="adm-empty">조건에 맞는 서명자가 없어요</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="adm-muted adm-foot-note">서명자 연락처는 받지 않아요. 「전달용 명단 만들기」는 의회별로 활동명 · 지역 · 서명일만 담은 명단을 만들고, 만든 기록은 관리자 활동 기록에 남아요.</p>
      {notice && <NoticeModal campaignId={id} onClose={() => setNotice(false)} targets={[{ key: 'all', label: '서명한 사람 전체', count: signers.length }]} />}
      {list && <DeliveryListModal campaignId={id} councils={councils} total={signers.length} closeDate={s.recruitEnd ?? null} onClose={() => setList(false)} />}
      {answer && <DeliveryResultForm campaignId={id} councils={councils.map(([name]) => name)} onClose={() => setAnswer(false)} />}
    </div>
  );
}
