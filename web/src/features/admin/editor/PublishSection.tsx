import type { PublishMode } from '@shared/types';
import { Button } from '../../../components/ui';
import { useEditor } from './context';
import { koDateTime } from './model';
import { ChipGroup, Section, ToggleRow } from './parts';

const ACTION: Record<PublishMode, string> = { now: '바로 공개하기', scheduled: '공개 예약하기', draft: '초안으로 저장' };

/** 7. 공개: 바로 · 예약 · 초안, 모집 예정 미리 보이기, 홈 히어로 */
export function PublishSection({ busy, errors, onPublish, onCancel }: {
  busy: boolean; errors: Record<string, string>; onPublish(): void; onCancel(): void;
}) {
  const ed = useEditor();
  const { draft } = ed;
  const start = draft.schedule.recruitStart ? koDateTime(draft.schedule.recruitStart, draft.schedule.recruitStartTime ?? '00:00') : '정한 모집 시작 시각';
  const startWord = draft.type === 'signature' ? '서명 시작 시각' : '모집 시작 시각';
  const desc: Record<PublishMode, string> = {
    now: '바로 공개: 지금 캠페인 목록에 나타나요. 모집 시작 전에는 「모집 예정」으로 보이고 알림 신청을 받아요.',
    scheduled: `예약 공개: ${startWord}(${start})에 캠페인 목록에 나타나요. 그 전에는 모집 예정으로 미리 보여 줄 수도 있어요.`,
    draft: '초안으로 저장: 관리자에게만 보여요. 준비가 끝나면 바로 공개나 예약 공개로 바꿔요.',
  };
  const messages = Object.values(errors);
  return (
    <Section n={7} title="공개">
      <div className="ed-row">
        <span className="ed-label">공개 방식</span>
        <ChipGroup<PublishMode>
          label="공개 방식" value={draft.publishMode} onChange={(v) => ed.set({ publishMode: v })}
          options={[['now', '바로 공개'], ['scheduled', '예약 공개'], ['draft', '초안으로 저장']]}
        />
        <p className="ed-hint">{desc[draft.publishMode]}</p>
      </div>
      {draft.publishMode === 'scheduled' && (
        <ToggleRow title="모집 예정으로 미리 보여 주기" on={draft.showUpcoming} onChange={(v) => ed.set({ showUpcoming: v })}
          desc="공개 전에도 목록에 「모집 예정」으로 보이고 알림 신청을 받아요." />
      )}
      {draft.publishMode !== 'draft' && (
        <ToggleRow title="홈 히어로에 걸기" on={draft.settings.heroEnabled} onChange={(v) => ed.setS({ heroEnabled: v })}
          desc="홈 첫 화면 왼쪽 캠페인 영역에 이 캠페인을 보여 줘요. 한 번에 하나만 걸 수 있어요." />
      )}
      {messages.length > 0 && (
        <div className="callout-warn ed-errors" role="alert">
          {messages.map((m) => <p key={m}>{m}</p>)}
        </div>
      )}
      <div className="ed-foot">
        <Button variant="ghost" pill onClick={onCancel}>취소</Button>
        <Button pill disabled={busy} onClick={onPublish}>{ACTION[draft.publishMode]}</Button>
      </div>
    </Section>
  );
}
