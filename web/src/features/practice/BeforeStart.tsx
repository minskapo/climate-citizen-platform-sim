import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dDay, koShort } from '@shared/date';
import { CONFIG } from '@shared/calculator/calculate';
import { missionForDate } from '@shared/missions';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { Button, Field } from '../../components/ui';
import { BlockSlotView } from '../campaigns/BlockSlotView';
import { HostCard } from '../campaigns/HostCard';
import { BoardWriteModal, ParticipantBoard, postPath } from '../campaigns/ParticipantBoard';
import { runLength, type ChecklistEntry, type CampaignDetail } from '../campaigns/types';
import { mdOf, reminderText, timeText, type usePracticeData } from './usePractice';

type Data = ReturnType<typeof usePracticeData>;
const TIMES = ['07:00', '08:00', '09:00', '12:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

/** 나의 출발점: 측정값 · 참여자 평균 · 2030 목표 */
export function StartPointCard({ detail, data }: { detail: CampaignDetail; data: Data }) {
  const [avg, setAvg] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    api<{ avg: number | null }>('/api/aggregates/calculator', { quiet: true }).then((r) => alive && setAvg(r.avg)).catch(() => alive && setAvg(null));
    return () => { alive = false; };
  }, []);
  const days = detail.campaign.schedule.runDays;
  const s = data.start;
  return (
    <section className="card cstart" aria-label="나의 출발점">
      <p className="chost-label">나의 출발점</p>
      {s ? (
        <p className="cstart-num"><strong>{s.result.total.toFixed(1)}톤</strong> <small>{mdOf(s.simDate)} 측정</small></p>
      ) : (
        <p className="cstart-num"><strong className="is-empty">아직 재지 않았어요</strong></p>
      )}
      <p className="cstart-note">
        참여자 평균은 {avg == null ? '아직 집계 중이에요' : `${avg.toFixed(1)}톤`}, 2030 1인당 목표는 {CONFIG.TARGET_2030}톤이에요.
        {days ? ` ${runLength(days)} 뒤 다시 재서 비교해요.` : ''}
      </p>
    </section>
  );
}

function ReminderModal({ detail, onClose, onSaved }: { detail: CampaignDetail; onClose(): void; onSaved(): void }) {
  const mine = detail.myParticipation!;
  const rem = mine.answers.reminder;
  const [enabled, setEnabled] = useState(rem?.enabled !== false);
  const [channel, setChannel] = useState<'push' | 'email'>(rem?.channel ?? 'push');
  const [time, setTime] = useState(rem?.time ?? detail.campaign.settings.reminderTime ?? '20:00');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/participations/${mine.id}/reminder`, { method: 'PUT', body: { enabled, channel, time }, quiet: true });
      showToast(enabled ? '미션 알림을 켰어요' : '미션 알림을 껐어요');
      onClose();
      onSaved();
    } catch (e) {
      showToast((e as Error).message || '알림을 바꾸지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  const times = TIMES.includes(time) ? TIMES : [...TIMES, time].sort();
  return (
    <Modal open onClose={onClose} title="미션 알림" description="체험에서는 실제로 보내지 않고, 알림함에만 보여요." width={480}
      footer={<><Button variant="outline" pill onClick={onClose}>취소</Button><Button pill onClick={save} disabled={busy}>저장</Button></>}>
      <div className="rem-form">
        <label className="rform-also"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> 미션 알림 받기</label>
        <div className="rem-row" role="radiogroup" aria-label="알림 방법">
          <label><input type="radio" name="ch" checked={channel === 'push'} onChange={() => setChannel('push')} disabled={!enabled} /> 앱 푸시</label>
          <label><input type="radio" name="ch" checked={channel === 'email'} onChange={() => setChannel('email')} disabled={!enabled} /> 이메일</label>
        </div>
        <Field label="알림 시각">
          <select className="input" value={time} onChange={(e) => setTime(e.target.value)} disabled={!enabled}>
            {times.map((t) => <option key={t} value={t}>{timeText(t)}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

/** H-2 시작 전: 완료 배너 · 시작 전 체크리스트 · 참가자 게시판 · 출발점 · 주최 모임 · 신청 취소 */
export function BeforeStart({ detail, data, completed, onChanged }: { detail: CampaignDetail; data: Data; completed: boolean; onChanged(): Promise<void> | void }) {
  const sim = useSim();
  const c = detail.campaign;
  const s = c.schedule;
  const mine = detail.myParticipation!;
  const [remOpen, setRemOpen] = useState(false);
  const [greet, setGreet] = useState(false);
  const [preview, setPreview] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [boardKey, setBoardKey] = useState(0);
  const daily = c.settings.recordCycle === 'daily';
  const first = s.runStart ? missionForDate(detail.missions, c.settings.missionCycle ?? 'daily', s.runStart, s.runStart, s.runDays ?? undefined) : null;
  const list = detail.checklist;
  const doneCount = list.filter((e) => e.done).length;

  const markDone = async (key: string) => {
    try {
      await api(`/api/campaigns/${c.id}/checklist/${encodeURIComponent(key)}/done`, { method: 'POST', body: {}, quiet: true });
      await onChanged();
    } catch { /* 체크 표시는 다음에 */ }
  };

  const sub = (e: ChecklistEntry): string => {
    if (e.key === 'start_point') return data.start ? `${data.start.result.total.toFixed(1)}톤 · ${mdOf(data.start.simDate)} 측정` : '1.5도 계산기로 5분이면 돼요';
    if (e.key === 'reminder') return reminderText(mine.answers.reminder, c.settings.reminderTime ?? '20:00', daily);
    if (e.key === 'greet') return `${detail.counts.participants.toLocaleString('ko-KR')}명이 함께해요. 어디서 참여하는지 알려 주세요.`;
    if (e.key === 'first_mission') return first ? `${first.category ? `${first.category}: ` : ''}${first.title}` : '';
    return '';
  };

  const action = (e: ChecklistEntry) => {
    if (e.key === 'start_point') {
      return <Link className="link-btn" to={`/calculator?from=campaign&campaignId=${c.id}&kind=start`}>{e.done ? '다시 재기 →' : '재기 →'}</Link>;
    }
    if (e.key === 'reminder') return <button type="button" className="link-btn" onClick={() => setRemOpen(true)}>{e.done ? '바꾸기 →' : '켜기 →'}</button>;
    if (e.key === 'greet') return <button type="button" className="link-btn" onClick={() => setGreet(true)}>인사 쓰기 →</button>;
    if (e.key === 'first_mission') {
      return <button type="button" className="link-btn" aria-expanded={preview} onClick={() => { setPreview(!preview); if (!e.done) void markDone(e.key); }}>미리 보기 →</button>;
    }
    if (e.linkType === 'url' && e.target) {
      return <a className="link-btn" href={e.target} target="_blank" rel="noreferrer" onClick={() => void markDone(e.key)}>열기 ↗</a>;
    }
    if (e.linkType === 'post' && e.target) return <Link className="link-btn" to={postPath(c.id, e.target)} onClick={() => void markDone(e.key)}>읽기 →</Link>;
    if (e.linkType === 'tool' && e.target) return <Link className="link-btn" to={`/tools/${e.target}`} onClick={() => void markDone(e.key)}>열기 →</Link>;
    return e.done ? null : <button type="button" className="link-btn" onClick={() => void markDone(e.key)}>했어요 →</button>;
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      await api(`/api/participations/${mine.id}/cancel`, { method: 'POST', body: {}, quiet: true });
      showToast('신청을 취소했어요');
      setCancel(false);
      await onChanged();
    } catch (e) {
      showToast((e as Error).message || '취소하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cdetail">
      <div className="cdetail-main">
        <section className="cbanner" aria-label="시작 전">
          <div>
            <h2>{completed ? '신청이 완료됐어요!' : '곧 시작해요'}</h2>
            {s.runStart && <p>{koShort(s.runStart)}부터 {s.runDays ? runLength(s.runDays) : ''} 동안 함께해요. 시작하는 날 아침에 첫 미션을 알려 드릴게요.</p>}
          </div>
          {s.runStart && <div className="cbanner-dday"><small>시작까지</small><strong>{dDay(sim.today, s.runStart)}</strong></div>}
        </section>
        <BlockSlotView campaignId={c.id} screen="before" slot="top" />
        {list.length > 0 && (
          <section className="card cchk" aria-label="시작 전에 해 두면 좋아요">
            <div className="cchk-head"><h2>시작 전에 해 두면 좋아요</h2><span>{doneCount} / {list.length}</span></div>
            <ul>
              {list.map((e) => (
                <li key={e.key}>
                  <span className={`cchk-box${e.done ? ' on' : ''}`} role="img" aria-label={e.done ? '완료' : '아직'}>{e.done ? '✓' : ''}</span>
                  <div className="cchk-main">
                    <strong>{e.label}</strong>
                    {sub(e) && <small>{sub(e)}</small>}
                    {e.key === 'first_mission' && preview && first && (
                      <div className="cchk-preview">
                        <strong>{first.title}</strong>
                        {first.description && <p>{first.description}</p>}
                      </div>
                    )}
                  </div>
                  {action(e)}
                </li>
              ))}
            </ul>
          </section>
        )}
        <BlockSlotView campaignId={c.id} screen="before" slot="after_common" />
        <BlockSlotView campaignId={c.id} screen="before" slot="bottom" />
        <ParticipantBoard detail={detail} variant="compact" reloadKey={boardKey} />
      </div>
      <aside className="cdetail-side">
        {c.settings.startPoint?.enabled && <StartPointCard detail={detail} data={data} />}
        <HostCard host={c.host} compact />
        <div className="cside-link">
          <button type="button" className="link-quiet" onClick={() => setCancel(true)}>신청 취소하기</button>
          <small>시작 전까지 취소할 수 있어요.</small>
        </div>
      </aside>
      {remOpen && <ReminderModal detail={detail} onClose={() => setRemOpen(false)} onSaved={() => void onChanged()} />}
      {greet && <BoardWriteModal detail={detail} category="인사" onClose={() => setGreet(false)} onPosted={() => { setBoardKey((k) => k + 1); void onChanged(); }} />}
      {cancel && (
        <Modal open danger onClose={() => setCancel(false)} title="신청을 취소할까요?" description="시작 전까지 다시 신청할 수 있어요. 주최 모임 가입은 그대로 남아요."
          footer={<><Button variant="outline" pill onClick={() => setCancel(false)}>그대로 두기</Button><Button variant="danger" pill disabled={busy} onClick={doCancel}>신청 취소하기</Button></>} />
      )}
    </div>
  );
}
