import type { BlockSlot } from '@shared/types';
import { useCampaignContext, type BlockScreen } from './types';
import { BlockFrame } from '../sandbox/BlockFrame';

/**
 * 캠페인별 맞춤 영역 자리. 관리자가 이 화면에 정한 위치(slot)와 같을 때만 그린다.
 * 자리 안에서 블록형 웹 도구를 샌드박스 iframe(BlockFrame)으로 실행한다. 불러오지 못하면 빈 자리는 숨는다(.cblock:empty).
 */
export function BlockSlotView({ campaignId, screen, slot }: { campaignId: string; screen: BlockScreen; slot: BlockSlot }) {
  const ctx = useCampaignContext();
  const settings = ctx?.detail.campaign.id === campaignId ? ctx.detail.campaign.settings : null;
  if (!settings?.blockToolId) return null;
  if ((settings.slots?.[screen] ?? 'none') !== slot || slot === 'none') return null;
  return (
    <div className="cblock" data-block-slot={slot} data-block-screen={screen} data-tool-id={settings.blockToolId}>
      <BlockFrame toolId={settings.blockToolId} campaignId={campaignId} />
    </div>
  );
}
