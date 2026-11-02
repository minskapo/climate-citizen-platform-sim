import { useState } from 'react';
import { roundLabel } from '@shared/missions';
import type { MissionCycle, RecordCycle, RecordField } from '@shared/types';
import { Chip } from '../../../components/ui';
import { BundleImportModal } from '../modals/BundleImport';
import { MissionEditModal } from '../modals/MissionEdit';
import { StartToolModal } from '../modals/StartTool';
import { ChecklistSection } from './ChecklistSection';
import { useEditor } from './context';
import { MISSION_CYCLE_LABEL, RECORD_CYCLE_LABEL, RECORD_FIELD_LABEL, reminderLabel, summarySentence, type PracticeSettings } from './model';
import { ChipGroup, FieldError, MultiChips, Row, Section, ToggleRow, useHasError } from './parts';

const TIMES = ['07:00', '08:00', '09:00', '12:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

function ApplySettings() {
  const ed = useEditor();
  const s = ed.draft.settings as PracticeSettings;
  const [toolOpen, setToolOpen] = useState(false);
  const [consentOn, setConsentOn] = useState(s.extraConsents.length > 0);
  const capErr = useHasError('capacity');
  const times = TIMES.includes(s.reminderTime) ? TIMES : [...TIMES, s.reminderTime].sort();
  return (
    <Section n={3} title="신청 설정" note="참여 신청 창에 반영">
      <div className="ed-two">
        <Row label="정원" htmlFor="ed-cap" error="capacity" hint="비워 두면 제한 없이 받아요.">
          <div className="ed-suffix">
            <input
              id="ed-cap" type="number" min={1} className="input" placeholder="제한 없음" aria-invalid={capErr}
              value={s.capacity ?? ''} onChange={(e) => ed.setS({ capacity: e.target.value ? Math.round(Number(e.target.value)) : null })}
            />
            <span>명</span>
          </div>
        </Row>
        <Row label="미션 알림 기본값" htmlFor="ed-remind" error="reminderTime">
          <select id="ed-remind" className="input" value={s.reminderTime} onChange={(e) => ed.setS({ reminderTime: e.target.value })}>
            {times.map((t) => <option key={t} value={t}>{reminderLabel(t)}</option>)}
          </select>
        </Row>
      </div>
      <ToggleRow
        title="출발점 받기" on={s.startPoint.enabled} error="startPoint"
        desc="신청할 때 출발점 도구로 잰 기록을 고르거나, 신청 후 다시 재도록 해요. 마무리 때 같은 도구로 다시 재서 비교해요."
        onChange={(v) => ed.setS({ startPoint: { ...s.startPoint, enabled: v } })}
        extra={s.startPoint.enabled ? (
          <button type="button" className="ed-mini-pick" aria-label="출발점 도구 고르기" onClick={() => setToolOpen(true)}>
            <span className="ed-muted">출발점 도구</span> <b>{ed.toolName(s.startPoint.toolId) || '고르기'}</b> ▾
          </button>
        ) : undefined}
      />
      <ToggleRow
        title="추가 동의 항목" on={consentOn} error="extraConsents"
        desc="주최 모임 가입 · 연구 활용(선택)은 기본으로 들어가요. 사진 수집 등 다른 동의가 필요할 때만 켜요."
        onChange={(v) => { setConsentOn(v); ed.setS({ extraConsents: v ? (s.extraConsents.length ? s.extraConsents : ['']) : [] }); }}
      >
        {consentOn && (
          <div className="ed-consents">
            {s.extraConsents.map((c, i) => (
              <div key={i} className="ed-consent">
                <input
                  className="input" maxLength={40} value={c} aria-label={`추가 동의 ${i + 1}`} placeholder="예: 활동 사진 수집 · 게시에 동의해요"
                  onChange={(e) => ed.setS({ extraConsents: s.extraConsents.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <button type="button" className="ed-link-btn" onClick={() => ed.setS({ extraConsents: s.extraConsents.filter((_, j) => j !== i) })}>삭제</button>
              </div>
            ))}
            {s.extraConsents.length < 5 && (
              <button type="button" className="ed-add" onClick={() => ed.setS({ extraConsents: [...s.extraConsents, ''] })}>+ 동의 항목 추가</button>
            )}
          </div>
        )}
      </ToggleRow>
      {toolOpen && (
        <StartToolModal
          current={s.startPoint.toolId}
          onClose={() => setToolOpen(false)}
          onPick={(id) => { ed.setS({ startPoint: { ...s.startPoint, toolId: id } }); setToolOpen(false); }}
        />
      )}
    </Section>
  );
}

function MissionsAndRecords() {
  const ed = useEditor();
  const { draft } = ed;
  const s = draft.settings as PracticeSettings;
  const [edit, setEdit] = useState<number | 'new' | null>(null);
  const [bundleOpen, setBundleOpen] = useState(false);
  const unitErr = useHasError('numberUnit');
  const fields = s.recordFields;

  const setFields = (v: RecordField[]) => {
    const next = v.includes('check') ? v : ['check' as RecordField, ...v];
    ed.setS({ recordFields: next });
  };

  return (
    <Section n={4} title="미션과 기록" note="진행 화면에 반영">
      <ToggleRow
        title="기록 받기" on={s.recordEnabled} onChange={(v) => ed.setS({ recordEnabled: v })}
        desc="참가자가 미션 실천을 기록해요. 끄면 서명 · 모임처럼 신청만 받는 캠페인이 되고, 아래 설정은 숨겨져요."
      />
      {s.recordEnabled && (
        <>
          <Row label="미션 주기" error="missionCycle" hint={`미션이 얼마마다 바뀌는지 정해요. 주마다 바뀌면 진행 시작 요일에 새 미션이 열려요.`}>
            <ChipGroup<MissionCycle>
              label="미션 주기" value={s.missionCycle} onChange={(v) => ed.setS({ missionCycle: v })}
              options={(Object.keys(MISSION_CYCLE_LABEL) as MissionCycle[]).map((k) => [k, MISSION_CYCLE_LABEL[k]])}
            />
          </Row>
          <Row label="기록 주기" error="recordCycle" hint="참가자가 얼마나 자주 기록하는지 정해요. 미션 주기와 따로 고를 수 있어요.">
            <ChipGroup<RecordCycle>
              label="기록 주기" value={s.recordCycle} onChange={(v) => ed.setS({ recordCycle: v })}
              options={(Object.keys(RECORD_CYCLE_LABEL) as RecordCycle[]).map((k) => [k, RECORD_CYCLE_LABEL[k]])}
            />
          </Row>
          <Row
            label="기록 항목" error="recordFields"
            hint="여러 개를 고를 수 있어요. 숫자를 켜면 단위와 목표값을 정해 마무리 화면에서 합계를 보여 줘요. 거리 → 탄소처럼 계산이 필요하면 「웹 도구로 기록」을 골라 웹 도구가 저장 값을 플랫폼 기록으로 넘기게 해요."
          >
            <MultiChips<RecordField>
              label="기록 항목" values={fields} onChange={setFields} fixed={['check']}
              options={(Object.keys(RECORD_FIELD_LABEL) as RecordField[]).map((k) => [k, RECORD_FIELD_LABEL[k]])}
            />
          </Row>
          {fields.includes('number') && (
            <div className="ed-two">
              <Row label="숫자 단위" htmlFor="ed-unit" error="numberUnit">
                <input id="ed-unit" className="input" maxLength={10} placeholder="예: km" aria-invalid={unitErr}
                  value={s.numberUnit ?? ''} onChange={(e) => ed.setS({ numberUnit: e.target.value })} />
              </Row>
              <Row label="목표값 (선택)" htmlFor="ed-goal" error="numberGoal">
                <input id="ed-goal" type="number" min={0} className="input" value={s.numberGoal ?? ''}
                  onChange={(e) => ed.setS({ numberGoal: e.target.value ? Number(e.target.value) : undefined })} />
              </Row>
            </div>
          )}
          {fields.includes('webtool') && (
            <Row label="기록에 쓰는 웹 도구" htmlFor="ed-rtool" error="recordToolId">
              <select id="ed-rtool" className="input" value={s.recordToolId ?? ''} onChange={(e) => ed.setS({ recordToolId: e.target.value || null })}>
                <option value="">웹 도구를 골라 주세요</option>
                {ed.toolList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Row>
          )}
          <div className="ed-callout" aria-live="polite">
            <p className="ed-callout-title">참가자에게는 이렇게 보여요</p>
            <p>{summarySentence(s, draft.schedule, ed.missions.length)}</p>
          </div>

          <div className="ed-missions">
            <div className="ed-missions-head">
              <span>미션 목록 · {MISSION_CYCLE_LABEL[s.missionCycle]} ({ed.missions.length}개)</span>
              <button type="button" className="ed-link-btn ed-green" onClick={() => setBundleOpen(true)}>미션 묶음 불러오기</button>
            </div>
            {ed.missions.length === 0 && <p className="ed-missions-empty">아직 미션이 없어요. 미션을 추가하거나 미션 묶음을 불러와요.</p>}
            <ul>
              {ed.missions.map((m, i) => (
                <li key={m.id} className="ed-mission">
                  <span className="ed-mission-round">{m.date ? m.date.slice(5).replace('-', '. ') + '.' : roundLabel(s.missionCycle, m.round ?? 1) || '기간 내내'}</span>
                  {m.category && <Chip tone="gray" square>{m.category}</Chip>}
                  <span className="ed-mission-title">{m.title}</span>
                  <button type="button" className="ed-link-btn" onClick={() => setEdit(i)} aria-label={`${m.title} 수정`}>수정</button>
                </li>
              ))}
            </ul>
            <FieldError name="missions" />
            <div className="ed-missions-foot">
              {!(s.missionCycle === 'whole' && ed.missions.length >= 1) && (
                <button type="button" className="ed-add" onClick={() => setEdit('new')}>+ 미션 추가 (회차는 미션 주기에 맞춰 정해져요)</button>
              )}
              {ed.missions.length > 0 && <button type="button" className="ed-link-btn" onClick={() => void ed.saveBundle()}>이 목록을 미션 묶음으로 저장</button>}
            </div>
          </div>

          <ToggleRow
            title="미기록 알림 · 다시 시작 배너" on={s.missedAlert} onChange={(v) => ed.setS({ missedAlert: v })}
            desc="기록할 차례를 3번 연속 놓치면 알림을 보내고, 진행 화면에 다시 시작 배너를 띄워요. 매일 기록이면 3일이에요."
          />
        </>
      )}
      {edit !== null && (
        <MissionEditModal index={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />
      )}
      {bundleOpen && <BundleImportModal onClose={() => setBundleOpen(false)} />}
    </Section>
  );
}

export function PracticeSections() {
  return (
    <>
      <ApplySettings />
      <MissionsAndRecords />
      <ChecklistSection title="시작 전 체크리스트" note="시작 전 화면에 반영" lead="위 설정에 따라 항목이 자동으로 생기고, 참가자가 실제로 하면 자동으로 체크돼요." />
    </>
  );
}

