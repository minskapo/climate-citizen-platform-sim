import { useRef, useState } from 'react';
import type { CampaignType } from '@shared/types';
import { Button } from '../../../components/ui';
import { useFileUrl } from '../../../components/useFileUrl';
import { HostGroupModal } from '../modals/HostGroup';
import { useEditor } from './context';
import { ChipGroup, Counter, FieldError, PickButton, Row, Section, useHasError } from './parts';

const TITLE_MAX = 30;
const SUMMARY_MAX = 80;

export function BasicSection() {
  const ed = useEditor();
  const { draft } = ed;
  const img = useFileUrl(draft.imageFileId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [hostOpen, setHostOpen] = useState(false);
  const titleErr = useHasError('title');
  const summaryErr = useHasError('summary');

  return (
    <Section n={1} title="기본 정보">
      <Row label="캠페인 이름" htmlFor="ed-title" error="title">
        <div className="ed-input-count">
          <input
            id="ed-title" className="input" value={draft.title} maxLength={TITLE_MAX} aria-invalid={titleErr}
            placeholder="예: 새해 1.5도 한달살기" onChange={(e) => ed.set({ title: e.target.value })}
          />
          <Counter value={draft.title} max={TITLE_MAX} />
        </div>
      </Row>
      <Row label="설명" htmlFor="ed-summary" error="summary" hint="목록 카드에는 2줄까지 보여요.">
        <div className="ed-input-count">
          <input
            id="ed-summary" className="input" value={draft.summary} maxLength={SUMMARY_MAX} aria-invalid={summaryErr}
            placeholder="어떤 캠페인인지 한두 문장으로 적어 주세요" onChange={(e) => ed.set({ summary: e.target.value })}
          />
          <Counter value={draft.summary} max={SUMMARY_MAX} />
        </div>
      </Row>
      <div className="ed-two">
        <Row label="유형" error="type">
          <ChipGroup<CampaignType>
            label="유형" value={draft.type} onChange={ed.requestType}
            options={[['signature', '서명'], ['practice', '실천'], ['offline', '오프라인 모임']]}
          />
        </Row>
        <Row label="방식" error="mode">
          <ChipGroup
            label="방식" value={draft.settings.mode} onChange={(v) => ed.setS({ mode: v })}
            options={[['online', '온라인'], ['offline', '오프라인'], ['hybrid', '온·오프라인']]}
          />
        </Row>
      </div>
      <div className="ed-image">
        <div className="ed-image-thumb">{img.url ? <img src={img.url} alt="대표 이미지" /> : <span>이미지</span>}</div>
        <div className="ed-image-text">
          <p className="ed-trow-title">대표 이미지</p>
          <p className="ed-trow-desc">목록 카드와 상세 머리에 함께 쓰여요. 1200×630 권장.</p>
          <FieldError name="imageFileId" />
        </div>
        <Button variant="outline" pill size="sm" onClick={() => fileRef.current?.click()}>이미지 올리기</Button>
        <input
          ref={fileRef} type="file" accept="image/*" hidden aria-label="대표 이미지 파일"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ed.uploadImage(f); }}
        />
      </div>
      <Row
        label="주최 모임" error="hostGroupId"
        hint="연결하면 참가 신청자가 그 모임에 자동으로 가입되고, 모임 게시판에 참가자 탭이 생겨요. 연결하지 않으면 주최는 「녹색전환연구소」로 보이고, 참가자 게시판은 캠페인 안에 생겨요. 협업 제안으로 함께 기획한 단체가 있으면 그 단체의 모임을 고를 수 있어요."
      >
        <ChipGroup
          label="주최 모임 연결" value={ed.hostLinked ? 'linked' : 'none'}
          onChange={(v) => { ed.setHostLinked(v === 'linked'); if (v === 'linked' && !draft.hostGroupId) setHostOpen(true); }}
          options={[['linked', '모임 연결'], ['none', '연결하지 않음']]}
        />
        {ed.hostLinked && (
          <PickButton label="주최 모임 고르기" text={draft.hostName ?? '모임을 골라 주세요'} onClick={() => setHostOpen(true)} />
        )}
      </Row>
      {hostOpen && (
        <HostGroupModal
          current={draft.hostGroupId}
          onClose={() => setHostOpen(false)}
          onPick={(g) => {
            setHostOpen(false);
            if (!g) { ed.setHostLinked(false); return; }
            ed.setHostLinked(true);
            ed.set({ hostGroupId: g.id, hostName: g.name });
          }}
        />
      )}
    </Section>
  );
}
