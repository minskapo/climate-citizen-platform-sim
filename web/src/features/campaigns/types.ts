import { createContext, useContext } from 'react';
import { campaignStatus, participantPhase, runEnd, type ParticipantPhase, type StatusInput } from '@shared/campaignStatus';
import { koRange } from '@shared/date';
import type { Mission } from '@shared/missions';
import type {
  BlockSlot, CampaignStatus, CampaignType, HHMM, ISODate, MissionCycle, PublishMode, RecordCycle, RecordField,
} from '@shared/types';

export type BlockScreen = 'detail' | 'before' | 'running' | 'final' | 'signed' | 'closed' | 'event' | 'after';
export type CampaignMode = 'online' | 'offline' | 'hybrid';

export interface CampaignSchedule {
  recruitStart?: ISODate | null; recruitStartTime?: HHMM | null; recruitEnd?: ISODate | null; recruitEndTime?: HHMM | null;
  runStart?: ISODate | null; runDays?: number | null; eventDate?: ISODate | null; eventStart?: HHMM | null; eventEnd?: HHMM | null;
  deliveryDate?: ISODate | null;
}

export interface CampaignSettingsView {
  mode: CampaignMode;
  hostLink?: 'linked' | 'none';
  slots?: Partial<Record<BlockScreen, BlockSlot>>;
  blockToolId?: string | null;
  // practice
  capacity?: number | null;
  reminderTime?: HHMM;
  startPoint?: { enabled: boolean; toolId: string };
  recordEnabled?: boolean;
  missionCycle?: MissionCycle;
  recordCycle?: RecordCycle;
  recordFields?: RecordField[];
  numberUnit?: string;
  numberGoal?: number;
  missedAlert?: boolean;
  [k: string]: unknown;
}

export interface Host { type: 'group' | 'igt'; id?: string; name: string }

export interface ChecklistEntry { key: string; kind: 'auto' | 'custom'; label: string; linkType?: 'post' | 'tool' | 'url'; target?: string; done: boolean }

export interface MyParticipation {
  id: string; state: string; companions: number; waitlistNo: number | null;
  consents: Record<string, unknown>; answers: { reminder?: { enabled?: boolean; time?: string; channel?: 'push' | 'email' }; [k: string]: unknown };
  createdAt: string; simDate: string | null; transport: string; startMeasurementId: string | null;
  pausedFrom: string | null; pausedUntil: string | null; pauseUsed: boolean; paused: boolean;
  /** 서명 캠페인: 내 서명이 몇 번째인지 · 내 공유 링크로 서명한 사람 수 */
  signatureNo?: number | null; referredCount?: number;
}

export interface CampaignFile { id: string; name: string; mime: string; bytes: number; exclusive: boolean }
export interface CampaignTool { toolId: string; name: string; exclusive: boolean }

export interface CampaignDetail {
  campaign: {
    id: string; type: CampaignType; title: string; summary: string; imageFileId: string | null;
    host: Host; hostGroupId: string | null; schedule: CampaignSchedule; settings: CampaignSettingsView;
    publish: PublishMode; showUpcoming: boolean; hero: boolean; createdAt: string;
  };
  status: CampaignStatus;
  phase: ParticipantPhase | null;
  counts: { participants: number; waitlisted: number; seatsTaken: number; capacity: number | null; seatsLeft: number | null; subscribers?: number };
  myParticipation: MyParticipation | null;
  missions: Mission[];
  checklist: ChecklistEntry[];
  files: CampaignFile[];
  tools: CampaignTool[];
  explainer: { id: string; title: string; body: string; attachments: unknown[]; createdAt: string; simDate?: string | null } | null;
  subscribed?: boolean;
}

export interface CampaignListItem {
  id: string; type: CampaignType; title: string; summary: string; imageFileId: string | null; host: Host;
  mode: CampaignMode; schedule: CampaignSchedule; status: CampaignStatus; participantCount: number; subscriberCount?: number; hero: boolean;
}

export const TYPE_LABEL: Record<CampaignType, string> = { practice: '실천', signature: '서명', offline: '오프라인 모임' };
export const TYPE_TONE: Record<CampaignType, 'green' | 'blue' | 'yellow'> = { practice: 'green', signature: 'blue', offline: 'yellow' };
export const MODE_LABEL: Record<CampaignMode, string> = { online: '온라인', offline: '오프라인', hybrid: '온·오프라인' };
export const STATUS_LABEL: Record<CampaignStatus, string> = { draft: '임시 저장', scheduled: '모집 예정', recruiting: '모집 중', running: '진행 중', closed: '마감' };
export const STATUS_TONE: Record<CampaignStatus, 'solid' | 'navy' | 'yellow' | 'gray'> = { draft: 'gray', scheduled: 'yellow', recruiting: 'solid', running: 'navy', closed: 'gray' };

/** Drafted schedules may carry nulls; shared status helpers want them absent. */
export function statusInputOf(c: { type: CampaignType; publish?: PublishMode; showUpcoming?: boolean; schedule: CampaignSchedule }): StatusInput {
  const schedule = Object.fromEntries(Object.entries(c.schedule).filter(([, v]) => v !== null && v !== undefined)) as unknown as StatusInput['schedule'];
  return { type: c.type, publish: c.publish ?? 'now', showUpcoming: c.showUpcoming ?? true, schedule };
}

/** 상태는 보는 사람의 「내 날짜」로 계산한다. */
export function statusFor(c: Parameters<typeof statusInputOf>[0], today: ISODate): CampaignStatus {
  try {
    return campaignStatus(statusInputOf(c), today);
  } catch {
    return 'draft';
  }
}

export function phaseFor(c: Parameters<typeof statusInputOf>[0], today: ISODate): ParticipantPhase | null {
  try {
    return participantPhase(statusInputOf(c), today);
  } catch {
    return null;
  }
}

export function runEndOf(c: Parameters<typeof statusInputOf>[0]): ISODate | null {
  return runEnd(statusInputOf(c));
}

/** 카드 · 머리의 기간 태그 */
export function periodLabel(c: { type: CampaignType; schedule: CampaignSchedule }): string {
  const s = c.schedule;
  if (c.type === 'practice' && s.runStart && s.runDays) return koRange(s.runStart, runEndOf({ type: c.type, schedule: s }) ?? s.runStart);
  if (c.type === 'offline' && s.eventDate) return koRange(s.eventDate, s.eventDate).split('–')[0];
  if (s.recruitStart && s.recruitEnd) return koRange(s.recruitStart, s.recruitEnd);
  return '';
}

/** 「4주」 or 「10일」 */
export function runLength(days: number): string {
  return days % 7 === 0 ? `${days / 7}주` : `${days}일`;
}

export const CampaignContext = createContext<{ detail: CampaignDetail; reload(): Promise<void> } | null>(null);
export function useCampaignContext() {
  return useContext(CampaignContext);
}

export const IGT_NAME = '녹색전환연구소';
