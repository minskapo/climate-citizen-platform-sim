export type ISODate = string; // 'YYYY-MM-DD'
export type HHMM = string; // 'HH:mm'
export type Role = 'guest' | 'member' | 'staff' | 'admin';
export type CampaignType = 'practice' | 'signature' | 'offline';
export type CampaignStatus = 'draft' | 'scheduled' | 'recruiting' | 'running' | 'closed';
export type PublishMode = 'now' | 'scheduled' | 'draft';
export type MissionCycle = 'daily' | 'weekly' | 'whole' | 'dated';
export type RecordCycle = 'daily' | 'thrice_weekly' | 'weekly' | 'once_end';
export type RecordField = 'check' | 'memo' | 'photo' | 'number' | 'webtool';
export type BlockSlot = 'top' | 'after_common' | 'bottom' | 'none';
export type JoinPolicy = 'open' | 'approval' | 'private';
export type SignatureJoin = 'ask' | 'auto' | 'none';
export type AttendanceMode = 'qr' | 'roster' | 'none';
export type ParticipationState = 'applied' | 'waitlisted' | 'cancelled' | 'paused' | 'quit' | 'signed';
export interface Schedule {
  recruitStart: ISODate;
  recruitStartTime?: HHMM;
  recruitEnd: ISODate;
  recruitEndTime?: HHMM;
  runStart?: ISODate; // practice
  runDays?: number;
  eventDate?: ISODate; // offline
  eventStart?: HHMM;
  eventEnd?: HHMM;
  deliveryDate?: ISODate; // signature
}
