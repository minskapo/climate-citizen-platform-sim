import { useState } from 'react';
import { Link } from 'react-router-dom';
import { dDay, koShort } from '@shared/date';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { Button } from '../../components/ui';
import { BlockSlotView } from '../campaigns/BlockSlotView';
import { HostCard } from '../campaigns/HostCard';
import { BoardWriteModal, ParticipantBoard, postPath } from '../campaigns/ParticipantBoard';
import type { CampaignDetail, ChecklistEntry } from '../campaigns/types';
import { canCancelNow, downloadIcs, offlineOf } from './util';

/** O-2 모임 전: D-day · 정확한 장소 · 모임 전 체크리스트 · 참가자 게시판 · 신청 취소(모집 마감까지) */
export function BeforeEvent({ detail, completed, onChanged, onPosted }: { detail: CampaignDetail; completed: boolean; onChanged(): Promise<void> | void; onPosted(): void }) {
  const sim = useSim();
  const c = detail.campaign;
  const s = c.schedule;
  const o = offlineOf(detail);
  const mine = detail.myParticipation!;
  const [greet, setGreet] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [boardKey, setBoardKey] = useState(0);
  const list = detail.checklist;
  const doneCount = list.filter((e) => e.done).length;
  const cancellable = canCancelNow(s, sim.today, sim.nowTime);
  const mapHref = `https://map.kakao.com/link/search/${encodeURIComponent(o.place.exact || o.place.public)}`;

  const markDone = async (key: string) => {
    try {
      await api(`/api/campaigns/${c.id}/checklist/${encodeURIComponent(key)}/done`, { method: 'POST', body: {}, quiet: true });
      await onChanged();
    } catch { /* 체크 표시는 다음에 */ }
  };

  const sub = (e: ChecklistEntry): string => {
    if (e.key === 'place') return o.place.exact || o.place.public;
    if (e.key === 'calendar') return s.eventDate ? `${koShort(s.eventDate)} ${s.eventStart ?? ''}${s.eventEnd ? ` – ${s.eventEnd}` : ''}` : '';
    if (e.key === 'greet') return `${detail.counts.participants.toLocaleString('ko-KR')}명이 함께해요. 같이 갈 사람을 찾아봐도 좋아요.`;
    if (e.key === 'supplies') return o.supplies;
    return '';
  };

  const action = (e: ChecklistEntry) => {
    if (e.key === 'place') return <a className="link-btn" href={mapHref} target="_blank" rel="noreferrer" onClick={() => void markDone(e.key)}>지도 보기 →</a>;
    if (e.key === 'calendar') {
      return (
        <button type="button" className="link-btn" onClick={() => { downloadIcs(detail, sim.today); showToast('내 캘린더에 넣었어요'); void markDone(e.key); }}>
          {e.done ? '다시 받기 →' : '캘린더에 넣기 →'}
        </button>
      );
    }
    if (e.key === 'greet') return <button type="button" className="link-btn" onClick={() => setGreet(true)}>인사 쓰기 →</button>;
    if (e.key === 'supplies') {
      return e.done ? null : <button type="button" className="link-btn" onClick={() => { showToast('준비물 확인을 체크했어요'); void markDone(e.key); }}>확인했어요 →</button>;
    }
    if (e.linkType === 'url' && e.target) return <a className="link-btn" href={e.target} target="_blank" rel="noreferrer" onClick={() => void markDone(e.key)}>열기 ↗</a>;
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
        <section className="cbanner" aria-label="모임 전">
          <div>
            <h2>{completed ? '신청이 완료됐어요! ' : ''}{s.eventDate ? koShort(s.eventDate) : ''}{s.eventStart ? ` ${s.eventStart}에 만나요` : ''}</h2>
            <p>하루 전 저녁과 2시간 전에 장소와 준비물을 다시 알려 드려요. 일정이 바뀌면 바로 알려 드릴게요.</p>
          </div>
          {s.eventDate && <div className="cbanner-dday"><small>모임까지</small><strong>{dDay(sim.today, s.eventDate)}</strong></div>}
        </section>
        <section className="card coff-place" aria-label="모임 장소">
          <p className="chost-label">모임 장소</p>
          <strong>{o.place.exact || o.place.public}</strong>
          <p className="coff-sub">건물 1층에서 운영진이 안내해요. 정확한 주소는 신청한 사람에게만 보여요.</p>
        </section>
        <BlockSlotView campaignId={c.id} screen="before" slot="top" />
        {list.length > 0 && (
          <section className="card cchk" aria-label="모임 전에 확인해 주세요">
            <div className="cchk-head"><h2>모임 전에 확인해 주세요</h2><span>{doneCount} / {list.length}</span></div>
            <ul>
              {list.map((e) => (
                <li key={e.key}>
                  <span className={`cchk-box${e.done ? ' on' : ''}`} role="img" aria-label={e.done ? '완료' : '아직'}>{e.done ? '✓' : ''}</span>
                  <div className="cchk-main"><strong>{e.label}</strong>{sub(e) && <small>{sub(e)}</small>}</div>
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
        <HostCard host={c.host} compact />
        <div className="cside-link">
          {cancellable ? (
            <>
              <button type="button" className="link-quiet" onClick={() => setCancel(true)}>신청 취소하기</button>
              <small>{s.recruitEnd ? `${koShort(s.recruitEnd)}${s.recruitEndTime ? ` ${s.recruitEndTime}` : ''}까지 취소할 수 있어요. ` : ''}취소하면 대기자에게 자리가 넘어가요.</small>
            </>
          ) : <small>모집 마감 뒤에는 취소할 수 없어요. 못 오게 되면 운영진에게 알려 주세요.</small>}
        </div>
      </aside>
      {greet && <BoardWriteModal detail={detail} category="인사" onClose={() => setGreet(false)} onPosted={() => { setBoardKey((k) => k + 1); onPosted(); void onChanged(); }} />}
      {cancel && (
        <Modal open danger onClose={() => setCancel(false)} title="신청을 취소할까요?" description="취소하면 대기자에게 자리가 넘어가요. 주최 모임 가입은 그대로 남아요."
          footer={<><Button variant="outline" pill onClick={() => setCancel(false)}>그대로 두기</Button><Button variant="danger" pill disabled={busy} onClick={doCancel}>신청 취소하기</Button></>} />
      )}
    </div>
  );
}
