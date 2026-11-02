import { useRef, useState } from 'react';
import { SCREENS_BY_TYPE } from '@shared/campaignSettings';
import type { BlockSlot } from '@shared/types';
import { BlockPickModal } from '../modals/BlockPick';
import { WebToolLinkModal } from '../modals/WebToolLink';
import { useEditor } from './context';
import { screenLabel, SLOT_LABEL, toolVersionLabel } from './model';
import { FieldError, PickButton, Row, Section } from './parts';

const SLOTS: BlockSlot[] = ['top', 'after_common', 'bottom', 'none'];

const BLOCK_HINT: Record<string, string> = {
  practice: '「웹 도구」에 올린 블록형 HTML 중에서 골라요. 없으면 맞춤 영역 없이 공통 틀만 보여요.',
  signature: '서명 수 · 목표 달성률 · 지역별 서명 수는 공통 틀이 보여 줘요. 맞춤 영역에는 그 밖의 설명(예: 구별 예산 비교)만 넣어요.',
  offline: '오프라인 모임은 공통 틀(일시 · 장소 · 정원)로 충분해요. 필요할 때만 블록을 골라요.',
};

/** 6. 맞춤 영역(블록형 웹 도구 · 화면별 위치)과 쓰는 자료(파일 · 웹 도구) */
export function BlockAndMaterials() {
  const ed = useEditor();
  const { draft } = ed;
  const s = draft.settings;
  const [pickOpen, setPickOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const block = s.blockToolId ? ed.toolList.find((t) => t.id === s.blockToolId) : null;
  const blockText = s.blockToolId ? `${block?.name ?? ed.toolName(s.blockToolId)}${block ? `  ${toolVersionLabel(block).split(' · ')[0]}` : ''}` : '맞춤 영역 없음';
  const empty = ed.files.length === 0 && ed.linkedTools.length === 0;

  return (
    <Section n={6} title="맞춤 영역과 쓰는 자료">
      <Row label="캠페인별 맞춤 영역 (블록형 웹 도구)" error="blockToolId" hint={BLOCK_HINT[draft.type]}>
        <PickButton label="맞춤 영역 고르기" text={blockText} onClick={() => setPickOpen(true)} />
      </Row>
      <div className="ed-row">
        <span className="ed-label">보이는 화면과 위치</span>
        <div className="ed-slots">
          {SCREENS_BY_TYPE[draft.type].map((screen) => (
            <label key={screen} className="ed-slot">
              <span>{screenLabel(draft.type, screen)}</span>
              <select
                className="input" aria-label={screenLabel(draft.type, screen)} disabled={!s.blockToolId}
                value={s.slots[screen] ?? 'none'}
                onChange={(e) => ed.setS({ slots: { ...s.slots, [screen]: e.target.value as BlockSlot } })}
              >
                {SLOTS.map((v) => <option key={v} value={v}>{SLOT_LABEL[v]}</option>)}
              </select>
            </label>
          ))}
        </div>
        <FieldError name="slots" />
        <p className="ed-hint">
          블록은 화면마다 세 위치 중 하나에만 놓아요. ① 맨 위: 머리 바로 아래(상태 배너가 있으면 그 아래) · ② 공통 정보 다음: 캠페인 정보 · 요구안 · 미션 카드 같은 공통 카드 다음 · ③ 맨 아래: 쓰는 도구 · 게시판 위. 옆 패널과 신청 버튼 주변에는 놓을 수 없어요.
        </p>
      </div>
      <div className="ed-row">
        <span className="ed-label">쓰는 자료와 웹 도구</span>
        <div className="ed-materials">
          {empty && <span className="ed-muted">아직 붙인 자료가 없어요.</span>}
          {ed.linkedTools.map((t) => (
            <span key={`t-${t.toolId}`} className="ed-mat">
              {t.name || ed.toolName(t.toolId)}
              <button type="button" className={`ed-mat-ex${t.exclusive ? ' is-on' : ''}`} aria-pressed={t.exclusive}
                onClick={() => void ed.saveTools(ed.linkedTools.map((x) => (x.toolId === t.toolId ? { ...x, exclusive: !x.exclusive } : x)))}>
                캠페인 전용
              </button>
              <button type="button" className="ed-mat-x" aria-label={`${t.name} 빼기`}
                onClick={() => void ed.saveTools(ed.linkedTools.filter((x) => x.toolId !== t.toolId))}>✕</button>
            </span>
          ))}
          {ed.files.map((f) => (
            <span key={`f-${f.id}`} className="ed-mat">
              {f.name}
              <button type="button" className={`ed-mat-ex${f.exclusive ? ' is-on' : ''}`} aria-pressed={f.exclusive} onClick={() => void ed.toggleFileExclusive(f.id)}>캠페인 전용</button>
              <button type="button" className="ed-mat-x" aria-label={`${f.name} 빼기`} onClick={() => void ed.removeFile(f.id)}>✕</button>
            </span>
          ))}
          <span className="ed-mat-actions">
            <button type="button" className="ed-add" onClick={() => fileRef.current?.click()}>+ 파일 올리기</button>
            <button type="button" className="ed-add" onClick={() => setLinkOpen(true)}>+ 웹 도구 연결</button>
          </span>
          <input ref={fileRef} type="file" hidden aria-label="자료 파일 고르기"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ed.addFile(f); }} />
        </div>
        <FieldError name="tools" />
        <p className="ed-hint">
          {draft.type === 'signature'
            ? '서명 캠페인의 자료는 모두 누구나 볼 수 있게 두는 것을 권해요. 파일은 1MB까지 올릴 수 있어요.'
            : '파일(1MB 이하)은 여기서 바로 올리고, 웹 도구는 「웹 도구」에 올린 HTML 중에서 골라요. 「캠페인 전용」은 참가자만 내려받거나 실행할 수 있어요.'}
        </p>
      </div>
      {pickOpen && (
        <BlockPickModal
          current={s.blockToolId}
          onClose={() => setPickOpen(false)}
          onPick={(id) => {
            setPickOpen(false);
            if (!id) {
              ed.setS({ blockToolId: null, slots: Object.fromEntries(Object.keys(s.slots).map((k) => [k, 'none'])) });
              return;
            }
            const anyPlaced = Object.values(s.slots).some((v) => v !== 'none');
            ed.setS({ blockToolId: id, ...(anyPlaced ? {} : { slots: { ...s.slots, detail: 'after_common' } }) });
          }}
        />
      )}
      {linkOpen && (
        <WebToolLinkModal
          linked={ed.linkedTools.map((t) => t.toolId)}
          onClose={() => setLinkOpen(false)}
          onLink={async (ids) => {
            const ok = await ed.saveTools([...ed.linkedTools, ...ids.map((id) => ({ toolId: id, name: ed.toolName(id), exclusive: false }))]);
            if (ok) { setLinkOpen(false); }
          }}
        />
      )}
    </Section>
  );
}
