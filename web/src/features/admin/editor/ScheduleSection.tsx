import { Fragment } from 'react';
import { useEditor } from './context';
import { runLength, statusChain, type OfflineSettings, type SignatureSettings } from './model';
import { FieldError, Row, Section, useHasError } from './parts';

function DateTime({ label, date, time, onDate, onTime, field }: {
  label: string; date: string | null; time?: string | null; onDate(v: string | null): void; onTime?(v: string | null): void; field: string;
}) {
  const bad = useHasError(`schedule.${field}`);
  return (
    <div className="ed-row">
      <span className="ed-label">{label}</span>
      <div className="ed-dt">
        <input type="date" className="input" aria-label={`${label} 날짜`} aria-invalid={bad} value={date ?? ''} onChange={(e) => onDate(e.target.value || null)} />
        {onTime && <input type="time" className="input ed-time" aria-label={`${label} 시각`} value={time ?? ''} onChange={(e) => onTime(e.target.value || null)} />}
      </div>
      <FieldError name={[`schedule.${field}`, `schedule.${field}Time`]} />
    </div>
  );
}

function hours(a: string | null, b: string | null): string {
  if (!a || !b) return '';
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const d = m(b) - m(a);
  if (d <= 0) return '';
  return d % 60 === 0 ? `(${d / 60}시간)` : `(${Math.floor(d / 60)}시간 ${d % 60}분)`;
}

export function ScheduleSection() {
  const ed = useEditor();
  const { draft } = ed;
  const s = draft.schedule;
  const set = ed.setSchedule;
  const sig = draft.type === 'signature';
  const chain = statusChain(draft.type, s);
  const off = draft.settings as OfflineSettings;

  return (
    <Section n={2} title="일정">
      <div className="ed-two">
        <DateTime label={sig ? '서명 시작' : '모집 시작'} field="recruitStart" date={s.recruitStart} time={s.recruitStartTime}
          onDate={(v) => set({ recruitStart: v })} onTime={(v) => set({ recruitStartTime: v })} />
        <DateTime label={sig ? '서명 마감' : '모집 마감'} field="recruitEnd" date={s.recruitEnd} time={s.recruitEndTime}
          onDate={(v) => set({ recruitEnd: v })} onTime={(v) => set({ recruitEndTime: v })} />
      </div>
      {draft.type === 'practice' && (
        <div className="ed-two">
          <DateTime label="진행 시작" field="runStart" date={s.runStart} onDate={(v) => set({ runStart: v })} />
          <Row label="진행 기간" htmlFor="ed-rundays" error="schedule.runDays">
            <div className="ed-suffix">
              <input
                id="ed-rundays" type="number" min={1} max={365} className="input" value={s.runDays ?? ''}
                onChange={(e) => set({ runDays: e.target.value ? Math.round(Number(e.target.value)) : null })}
              />
              <span>일{s.runDays ? ` (${runLength(s.runDays)})` : ''}</span>
            </div>
          </Row>
        </div>
      )}
      {draft.type === 'offline' && (
        <>
          <div className="ed-two">
            <DateTime label="모임 날짜" field="eventDate" date={s.eventDate} onDate={(v) => set({ eventDate: v })} />
            <div className="ed-row">
              <span className="ed-label">시간</span>
              <div className="ed-dt">
                <input type="time" className="input ed-time" aria-label="시작 시각" value={s.eventStart ?? ''} onChange={(e) => set({ eventStart: e.target.value || null })} />
                <span>–</span>
                <input type="time" className="input ed-time" aria-label="끝나는 시각" value={s.eventEnd ?? ''} onChange={(e) => set({ eventEnd: e.target.value || null })} />
                <span className="ed-muted">{hours(s.eventStart, s.eventEnd)}</span>
              </div>
              <FieldError name={['schedule.eventStart', 'schedule.eventEnd', 'schedule.eventDate']} />
            </div>
          </div>
          <div className="ed-two">
            <Row label="정확한 주소" htmlFor="ed-place-exact" error="place.exact">
              <input id="ed-place-exact" className="input" maxLength={200} value={off.place.exact} placeholder="예: 마포구 성산동 시민 햇빛발전소 옥상"
                onChange={(e) => ed.setS({ place: { ...off.place, exact: e.target.value } })} />
            </Row>
            <Row label="공개용 대략 위치" htmlFor="ed-place-public" error="place.public">
              <input id="ed-place-public" className="input" maxLength={100} value={off.place.public} placeholder="예: 마포구 성산동"
                onChange={(e) => ed.setS({ place: { ...off.place, public: e.target.value } })} />
            </Row>
          </div>
          <p className="ed-hint">정확한 주소는 신청한 사람에게만 보여요. 목록과 상세에는 공개용 위치까지만 보여요.</p>
        </>
      )}
      {sig && (
        <div className="ed-two">
          <DateTime label="전달 예정일 (선택)" field="deliveryDate" date={s.deliveryDate} onDate={(v) => set({ deliveryDate: v })} />
          <Row label="전달처" htmlFor="ed-target" error="deliveryTarget">
            <input id="ed-target" className="input" maxLength={100} value={(draft.settings as SignatureSettings).deliveryTarget}
              placeholder="예: 각 구의회 (서명자의 사는 지역별로 묶어 전달)" onChange={(e) => ed.setS({ deliveryTarget: e.target.value })} />
          </Row>
        </div>
      )}
      <div className="ed-chain" aria-label="상태 변화">
        <span className="ed-chain-lead">{sig ? '서명 캠페인에는 「진행 중」 단계가 없어요' : '상태는 일정에 따라 자동으로 바뀌어요'}</span>
        {chain.map((c, i) => (
          <Fragment key={c.label}>
            {i > 0 && <span className="ed-chain-arrow" aria-hidden="true">→</span>}
            <span className={`ed-chain-step ed-chain-${i}`}>{c.label}{c.date ? `  ${c.date}` : ''}</span>
          </Fragment>
        ))}
      </div>
    </Section>
  );
}
