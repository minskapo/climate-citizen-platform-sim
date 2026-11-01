import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '../../components/ui';
import { CampaignCard } from '../campaigns/CampaignCard';
import type { CampaignListItem } from '../campaigns/types';

/** 캠페인: 모집 중 → 진행 중 카드 3개 */
export function CampaignSection({ items, nickname }: { items: CampaignListItem[] | null; nickname: string | null }) {
  return (
    <section className="container hsec" aria-label="캠페인">
      <div className="hsec-head">
        <div>
          <h2 className="hsec-title">{nickname ? `${nickname} 님께 추천하는 캠페인` : '지금 참여할 수 있는 캠페인'}</h2>
          <p className="hsec-sub">{nickname ? '지역과 고른 정책을 바탕으로 골랐어요.' : '기간을 정해 함께 실천하는 활동이에요. 누구나 참여할 수 있어요.'}</p>
        </div>
        <Link to="/campaigns" className="hsec-more">전체 캠페인 →</Link>
      </div>
      {items === null ? <Spinner /> : items.length === 0
        ? <EmptyState title="지금 열린 캠페인이 없어요">새 캠페인이 열리면 여기에 보여 드려요.</EmptyState>
        : <div className="ccards">{items.slice(0, 3).map((c) => <CampaignCard key={c.id} c={c} />)}</div>}
    </section>
  );
}
