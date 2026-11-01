import type { ISODate } from '@shared/types';

export type Check = 'done' | 'partial' | 'none';
export const CHECK_LABEL: Record<Check, string> = { done: '했어요', partial: '조금 했어요', none: '못 했어요' };

export interface RecordView {
  id: string; slotDate: ISODate; missionId: string | null; check: Check; memo: string | null; photoFileId: string | null;
  number: number | null; postId: string | null; simDate: string | null; createdAt: string;
}

export interface RecordsResponse {
  records: RecordView[];
  slots: ISODate[];
  pausedDates: ISODate[];
  backfillable: ISODate[];
  nextSlot: ISODate | null;
  isSlotToday: boolean;
  progress: { done: number; total: number; dueSoFar: number; streak: number };
  missedStreak: number;
}

export interface Measurement { id: string; simDate: string; createdAt: string; campaignId: string | null; kind: string; result: { total: number } }
