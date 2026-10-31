import type { CampaignStatus, CampaignType, HHMM, ISODate, PublishMode, Schedule } from './types';
import { addDays, diffDays } from './date';

export interface StatusInput {
  type: CampaignType;
  publish: PublishMode;
  showUpcoming: boolean;
  schedule: Schedule;
}

export type ParticipantPhase = 'before' | 'running' | 'final' | 'after';

export function runEnd(c: StatusInput): ISODate | null {
  const s = c.schedule;
  if (c.type === 'practice') return s.runStart && s.runDays ? addDays(s.runStart, s.runDays - 1) : null;
  if (c.type === 'offline') return s.eventDate ?? null;
  return s.recruitEnd;
}

export function campaignStatus(c: StatusInput, today: ISODate): CampaignStatus {
  if (c.publish === 'draft') return 'draft';
  const s = c.schedule;
  if (today < s.recruitStart) return 'scheduled';
  if (c.type === 'signature') return today <= s.recruitEnd ? 'recruiting' : 'closed';
  if (c.type === 'offline') {
    const ev = s.eventDate!;
    if (today < ev) return 'recruiting';
    return today === ev ? 'running' : 'closed';
  }
  const start = s.runStart!;
  if (today < start) return 'recruiting';
  return today <= runEnd(c)! ? 'running' : 'closed';
}

/** draft is admin-only (callers with admin role bypass this); scheduled only with showUpcoming. */
export function isVisible(c: StatusInput, today: ISODate): boolean {
  const st = campaignStatus(c, today);
  if (st === 'draft') return false;
  if (st === 'scheduled') return c.showUpcoming;
  return true;
}

export function canApply(c: StatusInput, today: ISODate, nowTime: HHMM): boolean {
  const st = campaignStatus(c, today);
  if (st === 'draft' || st === 'closed') return false;
  const s = c.schedule;
  const startTime = s.recruitStartTime ?? '00:00';
  if (today < s.recruitStart || (today === s.recruitStart && nowTime < startTime)) return false;
  if (today > s.recruitEnd) return false;
  if (today === s.recruitEnd && s.recruitEndTime && nowTime >= s.recruitEndTime) return false;
  return true;
}

function runStartOf(c: StatusInput): ISODate {
  const s = c.schedule;
  if (c.type === 'practice') return s.runStart!;
  if (c.type === 'offline') return s.eventDate!;
  return s.recruitStart;
}

export function participantPhase(c: StatusInput, today: ISODate): ParticipantPhase {
  const end = runEnd(c);
  if (today < runStartOf(c)) return 'before';
  if (end && today > end) return 'after';
  if (c.type === 'practice' && end && today === end) return 'final';
  return 'running';
}

export function dayIndex(c: StatusInput, today: ISODate): number | null {
  if (c.type !== 'practice') return null;
  const { runStart, runDays } = c.schedule;
  if (!runStart || !runDays) return null;
  const n = diffDays(runStart, today) + 1;
  return n >= 1 && n <= runDays ? n : null;
}
