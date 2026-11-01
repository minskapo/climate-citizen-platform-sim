import { Link, useNavigate, useParams } from 'react-router-dom';
import { PostView } from '../../components/PostView';
import { EmptyState, Spinner } from '../../components/ui';
import { useCampaignDetail } from './CampaignDetailPage';
import { CAMPAIGN_BOARD_CATEGORIES } from './ParticipantBoard';
import '../groups/groups.css';
import './campaigns.css';

/** 캠페인 참가자 게시판 글 한 편 */
export function CampaignPostPage() {
  const { id = '', postId = '' } = useParams();
  const nav = useNavigate();
  const { detail, error } = useCampaignDetail(id);
  if (error) return <div className="container page"><EmptyState title={error} /></div>;
  if (!detail) return <div className="container page"><Spinner /></div>;
  const c = detail.campaign;
  const member = !!detail.myParticipation && !['cancelled'].includes(detail.myParticipation.state);
  return (
    <div className="container page gpost">
      <nav className="crumbs" aria-label="현재 위치">
        <Link to="/campaigns">캠페인</Link> › <Link to={`/campaigns/${c.id}`}>{c.title}</Link> › <Link to={`/campaigns/${c.id}?tab=board`}>참가자 게시판</Link>
      </nav>
      <PostView
        postId={postId}
        categories={CAMPAIGN_BOARD_CATEGORIES}
        canComment={member}
        commentNotice="참가자만 댓글을 쓸 수 있어요"
        onDeleted={() => nav(`/campaigns/${c.id}?tab=board`)}
      />
    </div>
  );
}
