import type { BlockSlot } from '@shared/types';
import { useCampaignContext, type BlockScreen } from './types';

/**
 * 캠페인별 맞춤 영역 자리. 관리자가 이 화면에 정한 위치(slot)와 같을 때만 그린다.
 * 블록형 웹 도구 실행(BlockFrame)은 웹 도구 작업에서 붙는다. 그 전에는 테두리 없는 빈 자리만 둔다.
 */
export function BlockSlotView({ campaignId, screen, slot }: { campaignId: string; screen: BlockScreen; slot: BlockSlot }) {
  const ctx = useCampaignContext();
  const settings = ctx?.detail.campaign.id === campaignId ? ctx.detail.campaign.settings : null;
  if (!settings?.blockToolId) return null;
  if ((settings.slots?.[screen] ?? 'none') !== slot || slot === 'none') return null;
  return <div className="cblock" data-block-slot={slot} data-block-screen={screen} data-tool-id={settings.blockToolId} />;
}
