import { useState } from 'react';
import { addDays } from '@shared/date';
import { MISSION_TITLE_MAX } from '@shared/campaignSettings';
import { roundLabel } from '@shared/missions';
import type { RecordField } from '@shared/types';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/ui';
import { useEditor } from '../editor/context';
import type { MissionDraft, PracticeSettings } from '../editor/model';
import { FieldError } from '../editor/parts';

const CATEGORIES = ['이동', '먹거리', '에너지', '소비', '자원순환', '함께하기'];
const EXTRA: Array<[RecordField, string]> = [['number', '+ 숫자 입력'], ['photo', '+ 사진 필수'], ['memo', '+ 한 줄 메모']];

/** 미션 추가 · 수정 */
export function MissionEditModal({ index, onClose }: { index: number | null; onClose(): void }) {
  const ed = useEditor();
  const s = ed.draft.settings as PracticeSettings;
  const cycle = s.missionCycle;
  const { runStart, runDays } = ed.draft.schedule;
  const cur = index !== null ? ed.missions[index] : null;
  const used = new Set(ed.missions.filter((_, i) => i !== index).map((m) => (cycle === 'dated' ? m.date : String(m.round))));
  const maxRound = cycle === 'weekly' ? (runDays ? Math.ceil(runDays / 7) : 52) : cycle === 'daily' ? runDays ?? 60 : 1;
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1).filter((r) => !used.has(String(r)) || cur?.round === r);
  const [round, setRound] = useState<number>(cur?.round ?? rounds[0] ?? 1);
  const [date, setDate] = useState<string>(cur?.date ?? '');
  const [category, setCategory] = useState(cur?.category ?? '');
  const [title, setTitle] = useState(cur?.title ?? '');
  const [description, setDescription] = useState(cur?.description ?? '');
  const [extra, setExtra] = useState<RecordField[]>(cur?.extraFields ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toDraft = (m: (typeof ed.missions)[number]): MissionDraft => ({ id: m.id, round: m.round, date: m.date, category: m.category, title: m.title, description: m.description, extraFields: m.extraFields });

  const save = async (remove = false) => {
    setErr(null);
    if (!remove) {
      if (!title.trim()) { setErr('미션 문구를 적어 주세요'); return; }
      if (cycle === 'dated' && !date) { setErr('미션 날짜를 정해 주세요'); return; }
    }
    const me: MissionDraft = {
      ...(cur ? { id: cur.id } : {}), round: cycle === 'dated' ? null : cycle === 'whole' ? 1 : round, date: cycle === 'dated' ? date : null,
      category: category.trim(), title: title.trim(), ...(description.trim() ? { description: description.trim() } : {}), extraFields: extra,
    };
    const rest = ed.missions.map(toDraft);
    const list = remove ? rest.filter((_, i) => i !== index) : index === null ? [...rest, me] : rest.map((m, i) => (i === index ? me : m));
    setBusy(true);
    const ok = await ed.saveMissions(list);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open onClose={onClose} title="미션 추가 · 수정"
      footer={<>
        {cur && <Button variant="ghost" className="mr-auto" disabled={busy} onClick={() => void save(true)}>삭제</Button>}
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button disabled={busy} onClick={() => void save()}>{cur ? '저장' : '추가'}</Button>
      </>}
    >
      <div className="ed-modal-form">
        <div className="ed-row">
          <span className="ed-label">넣을 자리</span>
          <div className="ed-chips" role="group" aria-label="넣을 자리">
            <button type="button" className={`ed-chip${cycle !== 'dated' ? ' is-on' : ''}`} aria-pressed={cycle !== 'dated'} disabled={cycle === 'dated'}>미션 주기대로</button>
            <button type="button" className={`ed-chip${cycle === 'dated' ? ' is-on' : ''}`} aria-pressed={cycle === 'dated'} disabled={cycle !== 'dated'}>특정 날짜에만</button>
          </div>
          <p className="ed-hint">{cycle === 'dated' ? '미션 주기가 「날짜 지정」이라 날짜를 골라 넣어요.' : '특정 날짜에만 여는 미션은 미션 주기를 「날짜 지정」으로 바꾸면 넣을 수 있어요.'}</p>
        </div>
        <div className="ed-two">
          {cycle === 'dated' ? (
            <label className="ed-row">
              <span className="ed-label">날짜</span>
              <input type="date" className="input" value={date} min={runStart ?? undefined} max={runStart && runDays ? addDays(runStart, runDays - 1) : undefined} onChange={(e) => setDate(e.target.value)} />
            </label>
          ) : cycle === 'whole' ? (
            <div className="ed-row"><span className="ed-label">회차</span><p className="ed-muted">기간 내내 하나</p></div>
          ) : (
            <label className="ed-row">
              <span className="ed-label">회차</span>
              <select className="input" value={round} onChange={(e) => setRound(Number(e.target.value))}>
                {rounds.map((r) => <option key={r} value={r}>{roundLabel(cycle, r)}</option>)}
              </select>
            </label>
          )}
          <label className="ed-row">
            <span className="ed-label">분류</span>
            <input className="input" list="ed-mission-cats" maxLength={20} value={category} placeholder="예: 에너지" onChange={(e) => setCategory(e.target.value)} />
            <datalist id="ed-mission-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
        </div>
        <label className="ed-row">
          <span className="ed-label">미션</span>
          <div className="ed-input-count">
            <input className="input" maxLength={MISSION_TITLE_MAX} value={title} placeholder="예: 엘리베이터 대신 계단 이용하기" onChange={(e) => setTitle(e.target.value)} />
            <span className="ed-count">{[...title].length} / {MISSION_TITLE_MAX}</span>
          </div>
        </label>
        <label className="ed-row">
          <span className="ed-label">설명 (선택)</span>
          <textarea className="input ed-textarea" rows={3} maxLength={500} value={description} placeholder="왜 이 미션을 하는지, 어떻게 하면 되는지 적어 주세요." onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="ed-row">
          <span className="ed-label">기록 항목</span>
          <div className="ed-chips" role="group" aria-label="미션별 기록 항목">
            <span className="ed-chip is-on is-static">캠페인 설정대로</span>
            {EXTRA.map(([f, label]) => {
              const on = extra.includes(f);
              return <button key={f} type="button" className={`ed-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => setExtra((l) => (on ? l.filter((x) => x !== f) : [...l, f]))}>{label}</button>;
            })}
          </div>
        </div>
        {err && <p className="field-error" role="alert">{err}</p>}
        <FieldError name="missions" />
      </div>
    </Modal>
  );
}
