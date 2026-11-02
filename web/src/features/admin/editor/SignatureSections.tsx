import { useState } from 'react';
import { koShort } from '@shared/date';
import { Modal } from '../../../components/Modal';
import { Editor } from '../../../components/Editor';
import { Button } from '../../../components/ui';
import { useSim } from '../../../lib/sim';
import { DeliveryModal } from '../modals/Delivery';
import { ChecklistSection } from './ChecklistSection';
import { useEditor } from './context';
import type { SignatureSettings } from './model';
import { ChipGroup, Counter, MultiChips, Row, Section, ToggleRow, useHasError } from './parts';

type Field = SignatureSettings['fields'][number];

function SignSettings() {
  const ed = useEditor();
  const s = ed.draft.settings as SignatureSettings;
  const sim = useSim();
  const [writeOpen, setWriteOpen] = useState(false);
  const demandErr = useHasError('demandSummary');
  const ex = ed.explainer;
  const exMeta = ex
    ? [ex.title, `본문 ${ex.body.split(/\n\s*\n/).filter((p) => p.trim()).length}문단`, ex.attachments.some((a) => a.mime.startsWith('image/')) ? `이미지 ${ex.attachments.filter((a) => a.mime.startsWith('image/')).length}장` : '', ex.simDate ? `${koShort(ex.simDate).replace(/\(.\)$/, '')} 수정` : '']
      .filter(Boolean).join(' · ')
    : '아직 설명 글이 없어요';

  return (
    <Section n={3} title="서명 설정" note="서명 창에 반영">
      <Row label="요구안 요약" htmlFor="ed-demand" error="demandSummary" hint="서명 창과 상세 맨 위에 보이는 한두 문장이에요. 자세한 배경은 아래 「설명 글」에 써요.">
        <div className="ed-input-count">
          <textarea id="ed-demand" className="input ed-textarea" rows={3} maxLength={1000} aria-invalid={demandErr}
            value={s.demandSummary} onChange={(e) => ed.setS({ demandSummary: e.target.value })} />
          <Counter value={s.demandSummary} max={1000} />
        </div>
      </Row>
      <Row
        label="설명 글 (게시물)" error={['explainer.title', 'explainer.body', 'explainerPostId']}
        hint="게시판 글쓰기와 같은 편집기로 써요. 사진 · 링크를 넣을 수 있고, 상세 화면의 요구안 아래에 보여요. 그래프나 계산처럼 움직이는 내용이 필요하면 맞춤 영역(블록형 웹 도구)을 함께 써요. PDF는 받지 않아요."
      >
        <div className="ed-explainer">
          <span>{exMeta}</span>
          <button type="button" className="ed-link-btn ed-green" onClick={() => setWriteOpen(true)}>글 쓰기 · 고치기 →</button>
        </div>
        {!sim.userId && <p className="ed-hint">설명 글을 쓰려면 체험 도구 막대에서 활동명을 골라 주세요.</p>}
      </Row>
      <div className="ed-two">
        <Row label="목표 인원" htmlFor="ed-goal-n" error="goal">
          <div className="ed-suffix">
            <input id="ed-goal-n" type="number" min={1} className="input" value={s.goal}
              onChange={(e) => ed.setS({ goal: Math.round(Number(e.target.value) || 0) })} />
            <span>명</span>
          </div>
        </Row>
        <Row label="서명 수 공개" htmlFor="ed-count" error="countDisplay">
          <select id="ed-count" className="input" value={s.countDisplay} onChange={(e) => ed.setS({ countDisplay: e.target.value })}>
            <option value="count_and_rate">서명 수와 목표 달성률</option>
            <option value="count">서명 수만</option>
            <option value="hidden">공개하지 않음</option>
          </select>
        </Row>
      </div>
      <Row label="서명할 때 받는 정보" error="fields" hint="실명은 전달처가 요구할 때만 켜요. 실명과 의견은 운영자와 전달처에만 보이고 공개 화면에는 보이지 않아요.">
        <MultiChips<Field>
          label="서명할 때 받는 정보" values={s.fields} fixed={['nickname', 'region']}
          onChange={(v) => ed.setS({ fields: (['nickname', 'region', 'realname', 'opinion'] as Field[]).filter((f) => v.includes(f) || f === 'nickname' || f === 'region') })}
          options={[['nickname', '활동명 (필수)'], ['region', '사는 지역 (필수)'], ['realname', '실명'], ['opinion', '한 줄 의견']]}
        />
      </Row>
      {ed.hostLinked && (
        <Row label="주최 모임 가입" error="hostJoin" hint="서명은 가볍게 참여하는 캠페인이라 기본은 「선택으로 묻기」예요. 주최 모임을 연결하지 않으면 이 항목은 숨겨져요.">
          <ChipGroup
            label="주최 모임 가입" value={s.hostJoin} onChange={(v) => ed.setS({ hostJoin: v })}
            options={[['ask', '선택으로 묻기'], ['auto', '자동 가입'], ['none', '묻지 않기']]}
          />
        </Row>
      )}
      <div className="ed-trow">
        <div className="ed-trow-main">
          <div className="ed-trow-text">
            <p className="ed-trow-title">요구안 전달 동의 (필수)</p>
            <p className="ed-trow-desc">서명할 때 「활동명과 사는 지역을 요구안과 함께 전달처에 내는 것」에 동의를 받아요. 연구 활용(선택)은 기본으로 들어가요.</p>
          </div>
        </div>
      </div>
      <Modal open={writeOpen} onClose={() => setWriteOpen(false)} title="설명 글" description="상세 화면의 요구안 아래에 보여요." width={720}>
        <Editor
          initial={ex ? { title: ex.title, body: ex.body, attachments: ex.attachments } : undefined}
          categories={[]} allowNotice={false} submitLabel="저장"
          onCancel={() => setWriteOpen(false)}
          onSubmit={async (v) => { await ed.saveExplainer(v); setWriteOpen(false); }}
        />
      </Modal>
    </Section>
  );
}

function StatusAndDelivery() {
  const ed = useEditor();
  const s = ed.draft.settings as SignatureSettings;
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const shown = [s.deliveryNotice && '마감 후: 전달 결과와 전달처 답변', s.regionalCounts && '지역별 서명 수'].filter(Boolean).join(', ');
  return (
    <Section n={4} title="서명 현황과 전달" note="캠페인 상세 · 마감 화면에 반영">
      <ToggleRow title="지역별 서명 수 보여 주기" on={s.regionalCounts} onChange={(v) => ed.setS({ regionalCounts: v })}
        desc="시 · 군 · 구별 서명 수를 표로 보여 줘요. 10명 미만인 지역은 「10명 미만」으로 묶어 보여 줘요." />
      <ToggleRow title="목표 달성 알림" on={s.goalAlerts} onChange={(v) => ed.setS({ goalAlerts: v })}
        desc="목표의 50% · 100%에 닿으면 서명한 사람에게 알리고 공유를 부탁해요." />
      <ToggleRow title="전달 결과 공지" on={s.deliveryNotice} onChange={(v) => ed.setS({ deliveryNotice: v })}
        desc="마감 후 「전달 결과 올리기」로 전달 사진과 전달처 답변을 올리면, 서명한 사람 모두에게 알림이 가고 캠페인 상세 맨 위에 보여요." />
      <div className="ed-callout">
        <p className="ed-callout-title">서명한 사람에게는 이렇게 보여요</p>
        <p>서명 직후: 「n번째 서명이에요」와 공유하기{shown ? `  ·  ${shown}` : ''}</p>
      </div>
      {ed.id && ed.live && (
        <div className="ed-delivery">
          <span>요구안을 전달했나요? 전달 사진과 전달처 답변을 올려요.</span>
          <Button variant="tint" size="sm" pill onClick={() => setDeliveryOpen(true)}>전달 결과 올리기</Button>
        </div>
      )}
      {deliveryOpen && ed.id && <DeliveryModal campaignId={ed.id} defaultTarget={s.deliveryTarget} onClose={() => setDeliveryOpen(false)} />}
    </Section>
  );
}

export function SignatureSections() {
  return (
    <>
      <SignSettings />
      <StatusAndDelivery />
      <ChecklistSection title="서명 후 안내" note="서명 완료 화면에 반영" lead="서명을 마치면 바로 보이는 다음 할 일이에요. 서명 캠페인에는 시작 전 단계가 없어요." />
    </>
  );
}
