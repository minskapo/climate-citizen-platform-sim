import { Chip } from '../../../components/ui';
import { useFileUrl } from '../../../components/useFileUrl';
import { useSim } from '../../../lib/sim';
import { IGT_NAME, MODE_LABEL, periodLabel, STATUS_LABEL, STATUS_TONE, statusFor, TYPE_LABEL, TYPE_TONE } from '../../campaigns/types';
import { useEditor } from './context';
import { autoChecklist, MISSION_CYCLE_LABEL, RECORD_CYCLE_LABEL, type OfflineSettings, type PracticeSettings, type SignatureSettings } from './model';

/** 옆 패널: 카드 미리보기 · 설정에 따라 바뀌는 화면 · 복제 안내 */
export function SidePreview({ clonedFrom }: { clonedFrom: string | null }) {
  const ed = useEditor();
  const sim = useSim();
  const { draft } = ed;
  const img = useFileUrl(draft.imageFileId);
  const card = { type: draft.type, schedule: draft.schedule, publish: draft.publishMode === 'draft' ? 'draft' as const : 'now' as const, showUpcoming: true };
  const st = statusFor(card, sim.today);
  const period = periodLabel(card);
  const auto = autoChecklist(draft, ed.missions.length, ed.files.length + ed.linkedTools.length).filter((a) => a.active).length;
  const extra = ed.custom.length;
  const blockOn = (screen: string) => !!draft.settings.blockToolId && draft.settings.slots[screen as keyof typeof draft.settings.slots] !== 'none';

  let screens: Array<[string, string]>;
  if (draft.type === 'practice') {
    const s = draft.settings as PracticeSettings;
    screens = [
      ['신청 창', [s.startPoint.enabled && '출발점', '알림', '동의'].filter(Boolean).join(' · ')],
      ['시작 전', `체크리스트 ${auto}${extra ? ` + 추가 ${extra}` : ''}`],
      ['진행 중', s.recordEnabled
        ? [`미션 ${MISSION_CYCLE_LABEL[s.missionCycle]}`, `기록 ${RECORD_CYCLE_LABEL[s.recordCycle]}`, blockOn('running') && '맞춤 영역'].filter(Boolean).join(' · ')
        : '신청만 받아요'],
      ['마무리', s.startPoint.enabled ? '출발점 도구로 다시 재기' : '기록 돌아보기'],
    ];
  } else if (draft.type === 'signature') {
    const s = draft.settings as SignatureSettings;
    screens = [
      ['서명 창', '요구안 · 받는 정보 · 전달 동의'],
      ['서명 완료', `공유 · 서명 후 안내 ${auto}${extra ? ` + 추가 ${extra}` : ''}`],
      ['캠페인 상세', [s.countDisplay === 'count_and_rate' ? '목표 달성률' : s.countDisplay === 'count' ? '서명 수' : '', s.regionalCounts && '지역별 서명 수', blockOn('detail') && '맞춤 영역'].filter(Boolean).join(' · ') || '요구안 · 설명 글'],
      ['마감', s.deliveryNotice ? '전달 결과 공지' : '마감 안내'],
    ];
  } else {
    const s = draft.settings as OfflineSettings;
    screens = [
      ['신청 창', ['정원', s.waitlist && '대기', (s.askCompanions || s.askTransport || s.customQuestion !== undefined) && '묻는 것', s.photoConsent && '사진 동의'].filter(Boolean).join(' · ')],
      ['신청 완료', `모임 전 체크리스트 ${auto}${extra ? ` + 추가 ${extra}` : ''}`],
      ['당일', s.attendance === 'qr' ? '현장 QR 출석' : s.attendance === 'roster' ? '명단 출석 체크' : '출석 확인 안 함'],
      ['끝난 뒤', s.reviewRequest ? '후기 · 사진 요청' : '모임 기록'],
    ];
  }

  return (
    <aside className="ed-side">
      <div className="card ed-side-card">
        <h2 className="ed-side-title">카드 미리보기</h2>
        <div className="ed-pcard">
          {img.url && <img className="ed-pcard-img" src={img.url} alt="" />}
          <div className="ed-pcard-tags">
            <Chip tone={STATUS_TONE[st]} square>{STATUS_LABEL[st]}</Chip>
            <Chip tone={TYPE_TONE[draft.type]} square>{TYPE_LABEL[draft.type]}</Chip>
            {period && <Chip tone="gray" square>{period}</Chip>}
            <Chip tone="gray" square>{MODE_LABEL[draft.settings.mode]}</Chip>
          </div>
          <p className="ed-pcard-title">{draft.title || '캠페인 이름'}</p>
          <p className="ed-pcard-host">{draft.hostName ?? IGT_NAME}</p>
          <p className="ed-pcard-desc">{draft.summary || '설명이 여기에 보여요'}</p>
          <p className="ed-pcard-foot">{st === 'scheduled' ? '0명 알림 신청' : '0명 참여'}</p>
        </div>
      </div>
      <div className="card ed-side-card">
        <h2 className="ed-side-title">설정에 따라 바뀌는 화면</h2>
        <dl className="ed-screens">
          {screens.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </div>
      {clonedFrom && (
        <div className="ed-side-note">
          <p className="ed-side-note-title">지난 캠페인 복제</p>
          <p>「{clonedFrom}」 설정을 가져왔어요. 일정과 이름만 바꾸면 돼요.</p>
        </div>
      )}
    </aside>
  );
}
