import { useMemo, useState } from 'react';
import { Button, LoadError, Spinner } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { AttendanceQrModal } from './AttendanceQrModal';
import { md } from './editor/model';
import { NoticeModal } from './NoticeModal';
import { FilterTabs, n, PartHead, pct, regionText, StatCards, useParticipants, type Part } from './participantsCommon';

type Tab = 'all' | 'in' | 'not' | 'wait';
const people = (r: Part) => 1 + r.companions;
const atText = (r: Part) => (r.attendance ? `${r.attendance.at.slice(11, 16)} · ${r.attendance.method === 'qr' ? 'QR' : '명단'}` : '아직');

/** M-1o 신청 · 출석 명단 */
export function OfflineRoster({ id }: { id: string }) {
  const sim = useSim();
  const { campaign, data, failed, reload } = useParticipants(id);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [qr, setQr] = useState(false);
  const [notice, setNotice] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const applied = useMemo(() => (data?.items ?? []).filter((r) => r.state === 'applied'), [data]);
  const waiting = useMemo(() => (data?.items ?? []).filter((r) => r.state === 'waitlisted'), [data]);
  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    const base = tab === 'wait' ? waiting : tab === 'in' ? applied.filter((r) => r.attendance) : tab === 'not' ? applied.filter((r) => !r.attendance) : applied;
    return base.filter((r) => !k || r.nickname.toLowerCase().includes(k) || regionText(r).toLowerCase().includes(k));
  }, [applied, waiting, tab, q]);

  if (failed) return <LoadError onRetry={() => void reload()} />;
  if (!campaign || !data) return <Spinner />;
  const c = campaign.campaign;
  const s = c.schedule;
  const o = c.settings as { attendance?: 'qr' | 'roster' | 'none'; capacity?: number | null; place?: { exact?: string; public?: string } };
  const seats = applied.reduce((a, r) => a + people(r), 0);
  const inCount = applied.filter((r) => r.attendance);
  const inPeople = inCount.reduce((a, r) => a + people(r), 0);
  const qrPeople = inCount.filter((r) => r.attendance!.method === 'qr').reduce((a, r) => a + people(r), 0);
  const photoPeople = applied.filter((r) => r.photo).reduce((a, r) => a + people(r), 0);
  const companions = applied.reduce((a, r) => a + r.companions, 0);

  const toggle = async (r: Part, on: boolean) => {
    setBusy(r.id);
    try {
      await api(`/api/participations/${r.id}/${on ? 'attend-manual' : 'unattend'}`, { body: {} });
      showToast(on ? `${r.nickname}님 출석을 체크했어요` : `${r.nickname}님 출석 체크를 취소했어요`);
      await reload();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '처리하지 못했어요');
    } finally {
      setBusy(null);
    }
  };

  const when = s.eventDate ? `${md(s.eventDate)} ${s.eventStart ?? ''}${s.eventEnd ? `–${s.eventEnd}` : ''}` : '';
  return (
    <div>
      <PartHead
        campaign={campaign} titleSuffix="신청과 출석"
        sub={`${c.host.name} 주최 · ${when} · ${o.place?.exact || o.place?.public || ''} · 지금 ${sim.nowTime}`}
        actions={<>
          <Button variant="outline" pill onClick={() => setNotice(true)}>공지 보내기</Button>
          {o.attendance === 'qr' && <Button variant="outline" pill onClick={() => setQr(true)}>출석 QR 띄우기</Button>}
        </>}
      />
      <StatCards cards={[
        { label: '인원', value: o.capacity != null ? `${n(seats)} / ${n(o.capacity)}명` : `${n(seats)}명`, note: `신청 ${n(applied.length)}건 · 동반 ${n(companions)}명` },
        { label: '출석', value: `${n(inPeople)}명`, note: `${pct(inPeople, seats)}% · QR ${n(qrPeople)}명 · 명단 체크 ${n(inPeople - qrPeople)}명 (동반 포함)` },
        { label: '대기', value: `${n(waiting.length)}명`, note: '취소가 생기면 순서대로 안내' },
        { label: '사진 동의', value: `${n(photoPeople)}명`, note: `미동의 ${n(seats - photoPeople)}명 · 명찰에 표시` },
      ]} />
      <div className="adm-toolbar">
        <FilterTabs<Tab> value={tab} onChange={setTab} tabs={[
          ['all', `전체 ${n(applied.length)}건`], ['in', `출석 ${n(inCount.length)}건`], ['not', `아직 ${n(applied.length - inCount.length)}건`], ['wait', `대기 ${n(waiting.length)}`],
        ]} />
        <input className="input adm-search" placeholder="⌕  활동명 검색" aria-label="활동명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="adm-table-wrap card adm-table-card">
        <table className="adm-table">
          <thead><tr><th>활동명</th><th>지역</th><th>신청일</th><th>동반 인원</th><th>출석</th><th>사진 동의</th><th>관리</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="adm-strong">{r.nickname}</td>
                <td>{regionText(r) || '–'}</td>
                <td>{md(r.appliedOn)}</td>
                <td>{n(r.companions)}명</td>
                <td className={r.attendance ? 'adm-ok' : ''}>{r.state === 'waitlisted' ? '대기' : atText(r)}</td>
                <td>{r.photo ? '동의' : '미동의'}</td>
                <td className="adm-actions">
                  {r.state !== 'applied' ? '–'
                    : !r.attendance ? <button type="button" disabled={busy === r.id} onClick={() => void toggle(r, true)}>출석 체크</button>
                    : r.attendance.method === 'manual' ? <button type="button" disabled={busy === r.id} onClick={() => void toggle(r, false)}>체크 취소</button> : '–'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="adm-empty">조건에 맞는 신청이 없어요</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="adm-muted adm-foot-note">연락처는 받지 않아요. 불참 · 일정 변경은 「공지 보내기」로 알려요. 모임이 끝나면 출석하지 않은 신청은 「불참」으로 바뀌고, 출석한 사람에게 후기 요청이 가요.</p>
      {qr && <AttendanceQrModal campaignId={id} start={s.eventStart ?? null} end={s.eventEnd ?? null} onClose={() => { setQr(false); void reload(); }} />}
      {notice && <NoticeModal campaignId={id} onClose={() => setNotice(false)} targets={[{ key: 'all', label: '전체', count: applied.length + waiting.length }]} />}
    </div>
  );
}
