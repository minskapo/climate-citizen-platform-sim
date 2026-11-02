import { useState } from 'react';
import type { AttendanceMode } from '@shared/types';
import { ChecklistSection } from './ChecklistSection';
import { useEditor } from './context';
import type { OfflineSettings } from './model';
import { ChipGroup, Counter, Row, Section, ToggleRow, useHasError } from './parts';

const ATTEND_HINT: Record<AttendanceMode, string> = {
  qr: '현장 QR을 찍으면 출석으로 기록되고 「참여 완료」가 돼요. QR은 모임 시작 1시간 전부터 열려요.',
  roster: '운영진이 신청 · 출석 명단에서 한 사람씩 체크해요.',
  none: '출석을 확인하지 않아요. 신청한 사람 모두 「참여 완료」로 보지 않아요.',
};

function ApplySettings() {
  const ed = useEditor();
  const s = ed.draft.settings as OfflineSettings;
  const [customOn, setCustomOn] = useState(s.customQuestion !== undefined);
  const capErr = useHasError('capacity');
  const asks: Array<[string, boolean, () => void]> = [
    ['동반 인원', s.askCompanions, () => ed.setS({ askCompanions: !s.askCompanions })],
    ['이동 수단', s.askTransport, () => ed.setS({ askTransport: !s.askTransport })],
    ['질문 직접 추가', customOn, () => { const v = !customOn; setCustomOn(v); ed.setS({ customQuestion: v ? s.customQuestion ?? '' : undefined }); }],
  ];
  return (
    <Section n={3} title="신청 설정" note="참여 신청 창에 반영">
      <div className="ed-two">
        <Row label="정원" htmlFor="ed-cap" error="capacity" hint="동반 인원을 포함한 자리 수예요.">
          <div className="ed-suffix">
            <input id="ed-cap" type="number" min={1} className="input" aria-invalid={capErr} value={s.capacity}
              onChange={(e) => ed.setS({ capacity: Math.round(Number(e.target.value) || 0) })} />
            <span>명</span>
          </div>
        </Row>
        <Row label="대기 신청" htmlFor="ed-wait" error="waitlist">
          <select id="ed-wait" className="input" value={s.waitlist ? 'on' : 'off'} onChange={(e) => ed.setS({ waitlist: e.target.value === 'on' })}>
            <option value="on">받기 · 취소가 생기면 순서대로 안내</option>
            <option value="off">받지 않기 · 정원이 차면 마감</option>
          </select>
        </Row>
      </div>
      <Row label="신청할 때 묻는 것" error="customQuestion" hint="연락은 플랫폼 알림과 이메일로 해요. 전화번호는 받지 않아요.">
        <div className="ed-chips" role="group" aria-label="신청할 때 묻는 것">
          {asks.map(([label, on, toggle]) => (
            <button key={label} type="button" className={`ed-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={toggle}>{label}</button>
          ))}
        </div>
        {customOn && (
          <input className="input" maxLength={100} aria-label="직접 추가한 질문" placeholder="예: 옥상 계단을 오를 수 있나요?"
            value={s.customQuestion ?? ''} onChange={(e) => ed.setS({ customQuestion: e.target.value })} />
        )}
      </Row>
      <ToggleRow title="사진 촬영 · 게시 동의" on={s.photoConsent} onChange={(v) => ed.setS({ photoConsent: v })}
        desc="현장 사진을 주최 모임 게시판과 결과 보고에 쓰도록 동의를 받아요. 동의하지 않은 사람은 운영진 명단에 표시돼요." />
    </Section>
  );
}

function DayOps() {
  const ed = useEditor();
  const s = ed.draft.settings as OfflineSettings;
  const flow = [
    '신청',
    s.preNotice && '하루 전 안내',
    s.attendance === 'qr' ? '현장에서 QR 출석' : s.attendance === 'roster' ? '현장에서 명단 출석' : '모임 참여',
    s.reviewRequest && '다음 날 후기 요청',
  ].filter(Boolean).join(' → ');
  return (
    <Section n={4} title="당일 운영" note="모임 전 · 당일 · 끝난 뒤 화면에 반영">
      <Row label="준비물 (선택)" htmlFor="ed-supplies" error="supplies" hint="모임 전 안내와 신청 완료 화면에 함께 보여요.">
        <div className="ed-input-count">
          <textarea id="ed-supplies" className="input ed-textarea" rows={2} maxLength={200} value={s.supplies}
            placeholder="예: 편한 신발, 모자, 물" onChange={(e) => ed.setS({ supplies: e.target.value })} />
          <Counter value={s.supplies} max={200} />
        </div>
      </Row>
      <Row label="출석 확인" error="attendance" hint={ATTEND_HINT[s.attendance]}>
        <ChipGroup<AttendanceMode>
          label="출석 확인" value={s.attendance} onChange={(v) => ed.setS({ attendance: v })}
          options={[['qr', '현장 QR'], ['roster', '운영진이 명단에서 체크'], ['none', '확인 안 함']]}
        />
      </Row>
      <ToggleRow title="모임 전 안내" on={s.preNotice} onChange={(v) => ed.setS({ preNotice: v })}
        desc="하루 전 저녁과 2시간 전에 장소 · 준비물 · 연락 방법을 알려 줘요." />
      <ToggleRow title="일정 변경 · 취소 공지" on={s.changeNotice} onChange={(v) => ed.setS({ changeNotice: v })}
        desc="날씨 등으로 바뀌면 「공지 보내기」로 신청자와 대기자 모두에게 바로 알려요." />
      <ToggleRow title="끝난 뒤 후기 · 사진 요청" on={s.reviewRequest} onChange={(v) => ed.setS({ reviewRequest: v })}
        desc="다음 날 출석한 사람에게 후기와 사진을 부탁하고, 주최 모임 게시판 「후기」로 모아요." />
      <div className="ed-callout">
        <p className="ed-callout-title">참가자에게는 이렇게 보여요</p>
        <p>{flow}  ·  미션 기록은 쓰지 않아요</p>
      </div>
      <p className="ed-hint">여러 번 모이며 실천을 기록하는 캠페인은 「실천」 유형을 고르고 미션 주기를 「날짜 지정」으로 쓰세요.</p>
    </Section>
  );
}

export function OfflineSections() {
  return (
    <>
      <ApplySettings />
      <DayOps />
      <ChecklistSection title="모임 전 체크리스트" note="신청 완료 화면에 반영" lead="위 설정에 따라 항목이 자동으로 생기고, 참가자가 실제로 하면 자동으로 체크돼요." />
    </>
  );
}
