export type JoinPolicy = 'open' | 'approval' | 'private';
export interface CampaignBadge { id: string; title: string; status: string }
export interface GroupView {
  id: string; name: string; sido: string; sigungu: string; joinPolicy: JoinPolicy; myRole: string | null; closed: boolean;
  description?: string; createdAt?: string; categories?: string[]; memberCount?: number; staffCount?: number; newPostsThisWeek?: number;
  campaign?: CampaignBadge | null; chatLink?: string; closedAt?: string | null; pendingTransferTo?: string | null; pendingTransferExpires?: string | null;
}
export const POLICY_LABEL: Record<JoinPolicy, string> = { open: '누구나', approval: '가입 승인', private: '비공개' };
export const POLICY_LABEL_LONG: Record<JoinPolicy, string> = { open: '누구나 가입', approval: '가입 승인', private: '비공개 (초대)' };
export const STATUS_LABEL: Record<string, string> = { recruiting: '모집 중', running: '진행 중', scheduled: '모집 예정', closed: '마감' };
export const STATUS_TONE: Record<string, 'solid' | 'navy' | 'yellow' | 'gray'> = { recruiting: 'solid', running: 'navy', scheduled: 'yellow', closed: 'gray' };
export const regionLabel = (g: { sido: string; sigungu?: string }) => g.sido || '전국·온라인';
export const IN_ROLES = ['owner', 'staff', 'member'];
