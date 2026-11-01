import { Link } from 'react-router-dom';
import { Chip } from '../../components/ui';
import { POLICY_LABEL, STATUS_LABEL, STATUS_TONE, type GroupView } from './types';

/** 모임 목록 카드: 이름 · 소개 · 「N명 · 이번 주 새 글 N개」 · 캠페인 딱지. 비공개 모임은 이름과 지역만. */
export function GroupCard({ g }: { g: GroupView }) {
  const hidden = g.description === undefined;
  return (
    <Link to={`/groups/${g.id}`} className={`gcard${g.joinPolicy === 'approval' ? ' is-approval' : ''}`}>
      <div className="gcard-top">
        <span className="gcard-avatar" aria-hidden="true">{[...g.name][0]}</span>
        <span className={`gcard-tag gcard-tag-${g.joinPolicy}`}>{g.sido || '전국'} · {g.joinPolicy === 'private' ? '비공개' : POLICY_LABEL[g.joinPolicy]}</span>
      </div>
      <h3 className="gcard-name">{g.name}</h3>
      {!hidden && <p className="gcard-desc">{g.description}</p>}
      {hidden && <p className="gcard-desc">초대받은 사람만 들어올 수 있어요.</p>}
      {!hidden && <p className="gcard-stat">{(g.memberCount ?? 0).toLocaleString('ko-KR')}명 · 이번 주 새 글 {g.newPostsThisWeek ?? 0}개</p>}
      {!hidden && (
        <div className="gcard-foot">
          {g.campaign
            ? <><Chip tone={STATUS_TONE[g.campaign.status] ?? 'gray'} square>{STATUS_LABEL[g.campaign.status] ?? g.campaign.status}</Chip><span className="gcard-camp">{g.campaign.title}</span></>
            : <span className="gcard-none">열린 캠페인 없음</span>}
        </div>
      )}
    </Link>
  );
}
