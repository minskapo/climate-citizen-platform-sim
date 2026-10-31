/**
 * 캠페인 유형별 설정 (설계 6.8 / docs/figma/admin/M-2.md · M-2s.md · M-2o.md 항목과 1:1).
 * Pure module (imports only @shared) so the admin editor can reuse types and validation.
 */
import type { AttendanceMode, BlockSlot, CampaignType, HHMM, ISODate, MissionCycle, RecordCycle, RecordField, Schedule, SignatureJoin } from '@shared/types';
import type { Mission } from '@shared/missions';
import { diffDays } from '@shared/date';

/** Built-in 1.5도 계산기, usable as 출발점 도구 without a tools row. */
export const CALCULATOR_TOOL_ID = 'calculator';

/** Screens a block can be placed on. practice: detail/before/running/final · signature: detail/signed/closed · offline: detail/before/event/after. */
export type BlockScreen = 'detail' | 'before' | 'running' | 'final' | 'signed' | 'closed' | 'event' | 'after';
export const BLOCK_SCREENS: readonly BlockScreen[] = ['detail', 'before', 'running', 'final', 'signed', 'closed', 'event', 'after'];
export const SCREENS_BY_TYPE: Record<CampaignType, readonly BlockScreen[]> = {
  practice: ['detail', 'before', 'running', 'final'],
  signature: ['detail', 'signed', 'closed'],
  offline: ['detail', 'before', 'event', 'after'],
};

export interface CommonSettings {
  /** 방식: 온라인 · 오프라인 · 온·오프라인 */
  mode: 'online' | 'offline' | 'hybrid';
  /** 주최 모임 연결 여부 (server keeps it in sync with host_group_id). */
  hostLink: 'linked' | 'none';
  /** 맞춤 영역 화면별 위치: ① top · ② after_common · ③ bottom · none */
  slots: Record<BlockScreen, BlockSlot>;
  /** 블록형 웹 도구 (null = 맞춤 영역 없음) */
  blockToolId: string | null;
  /** 홈 히어로에 걸기 (applied on publish; one campaign at a time) */
  heroEnabled: boolean;
}

export interface PracticeSettings extends CommonSettings {
  /** 정원 (null = 제한 없음) */
  capacity: number | null;
  /** 미션 알림 기본값 */
  reminderTime: HHMM;
  /** 출발점 받기 + 출발점 도구 */
  startPoint: { enabled: boolean; toolId: string };
  /** 추가 동의 항목 (주최 모임 가입 · 연구 활용은 기본) */
  extraConsents: string[];
  /** 기록 받기 (끄면 신청만 받는 캠페인) */
  recordEnabled: boolean;
  missionCycle: MissionCycle;
  recordCycle: RecordCycle;
  /** 기록 항목; 'check'(실천 체크) is required when recording is on. */
  recordFields: RecordField[];
  /** 숫자 기록 단위 · 목표값 ('number' 기록 항목) */
  numberUnit?: string;
  numberGoal?: number;
  /** 「웹 도구로 기록」에 쓰는 웹 도구 ('webtool' 기록 항목) */
  recordToolId?: string | null;
  /** 미기록 알림 · 다시 시작 배너 */
  missedAlert: boolean;
}

export type SignatureField = 'nickname' | 'region' | 'realname' | 'opinion';

export interface SignatureSettings extends CommonSettings {
  /** 요구안 요약 (≤1000자) */
  demandSummary: string;
  /** 설명 글 (posts, board_type 'campaign', category 'explainer'); set by PUT /explainer */
  explainerPostId: string | null;
  /** 목표 인원 */
  goal: number;
  /** 서명 수 공개 */
  countDisplay: 'count_and_rate' | 'count' | 'hidden';
  /** 서명할 때 받는 정보; nickname · region are required. */
  fields: SignatureField[];
  /** 주최 모임 가입: 선택으로 묻기 · 자동 가입 · 묻지 않기 (ignored without a host group) */
  hostJoin: SignatureJoin;
  /** 지역별 서명 수 보여 주기 */
  regionalCounts: boolean;
  /** 목표 달성 알림 (50% · 100%) */
  goalAlerts: boolean;
  /** 전달 결과 공지 */
  deliveryNotice: boolean;
  /** 전달처 (예: 각 구의회). 전달 예정일은 schedule.deliveryDate. */
  deliveryTarget: string;
}

export interface OfflineSettings extends CommonSettings {
  /** 정확한 주소 (신청자에게만) · 공개용 대략 위치 */
  place: { exact: string; public: string; lat?: number; lng?: number };
  /** 정원 (동반 인원 포함) */
  capacity: number;
  /** 대기 신청 받기 */
  waitlist: boolean;
  /** 신청할 때 묻는 것 */
  askCompanions: boolean;
  askTransport: boolean;
  customQuestion?: string;
  /** 사진 촬영 · 게시 동의 */
  photoConsent: boolean;
  /** 준비물 (≤200자) */
  supplies: string;
  /** 출석 확인: 현장 QR · 명단 체크 · 확인 안 함 */
  attendance: AttendanceMode;
  /** 모임 전 안내 · 일정 변경 공지 · 끝난 뒤 후기 요청 */
  preNotice: boolean;
  changeNotice: boolean;
  reviewRequest: boolean;
}

export type CampaignSettings = PracticeSettings | SignatureSettings | OfflineSettings;
export type SettingsFor<T extends CampaignType> = T extends 'practice' ? PracticeSettings : T extends 'signature' ? SignatureSettings : OfflineSettings;

/** Stored schedule: every field may be null while drafting (clone clears all). */
export type DraftSchedule = { [K in keyof Schedule]-?: Schedule[K] | null };
export const SCHEDULE_KEYS: readonly (keyof Schedule)[] = [
  'recruitStart', 'recruitStartTime', 'recruitEnd', 'recruitEndTime', 'runStart', 'runDays', 'eventDate', 'eventStart', 'eventEnd', 'deliveryDate',
];
export const emptySchedule = (): DraftSchedule =>
  Object.fromEntries(SCHEDULE_KEYS.map((k) => [k, null])) as unknown as DraftSchedule;

export type Validation = { ok: true } | { ok: false; field: string; message: string };

const commonDefaults = (type: CampaignType): CommonSettings => ({
  mode: type === 'offline' ? 'offline' : 'online',
  hostLink: 'none',
  slots: Object.fromEntries(BLOCK_SCREENS.map((s) => [s, 'none'])) as Record<BlockScreen, BlockSlot>,
  blockToolId: null,
  heroEnabled: false,
});

export function defaultSettings<T extends CampaignType>(type: T): SettingsFor<T>;
export function defaultSettings(type: CampaignType): CampaignSettings {
  const c = commonDefaults(type);
  if (type === 'practice') {
    return {
      ...c, capacity: null, reminderTime: '20:00', startPoint: { enabled: false, toolId: CALCULATOR_TOOL_ID }, extraConsents: [],
      recordEnabled: true, missionCycle: 'daily', recordCycle: 'daily', recordFields: ['check'], recordToolId: null, missedAlert: true,
    };
  }
  if (type === 'signature') {
    return {
      ...c, demandSummary: '', explainerPostId: null, goal: 1000, countDisplay: 'count_and_rate', fields: ['nickname', 'region'],
      hostJoin: 'ask', regionalCounts: true, goalAlerts: true, deliveryNotice: true, deliveryTarget: '',
    };
  }
  return {
    ...c, place: { exact: '', public: '' }, capacity: 20, waitlist: true, askCompanions: true, askTransport: false,
    photoConsent: true, supplies: '', attendance: 'qr', preNotice: true, changeNotice: true, reviewRequest: true,
  };
}

const KEYS: Record<CampaignType, readonly string[]> = {
  practice: Object.keys(defaultSettings('practice')).concat(['numberUnit', 'numberGoal']),
  signature: Object.keys(defaultSettings('signature')),
  offline: Object.keys(defaultSettings('offline')).concat(['customQuestion']),
};

/** Drops unknown keys (call after validateSettings). */
export function cleanSettings(type: CampaignType, s: Record<string, unknown>): CampaignSettings {
  return Object.fromEntries(KEYS[type].filter((k) => s[k] !== undefined).map((k) => [k, s[k]])) as unknown as CampaignSettings;
}

// ---- validation -------------------------------------------------------------

class Bad extends Error {
  constructor(public field: string, message: string) { super(message); }
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function oneOf<T extends string>(o: Record<string, unknown>, k: string, values: readonly T[], label: string, prefix = '') {
  if (!values.includes(o[k] as T)) throw new Bad(prefix + k, `${label} 값이 올바르지 않아요`);
}
function bool(o: Record<string, unknown>, k: string, label: string, prefix = '') {
  if (typeof o[k] !== 'boolean') throw new Bad(prefix + k, `${label} 값이 올바르지 않아요`);
}
function text(o: Record<string, unknown>, k: string, max: number, label: string, opts: { optional?: boolean; required?: boolean; prefix?: string } = {}) {
  const v = o[k];
  const f = (opts.prefix ?? '') + k;
  if (v === undefined && opts.optional) return;
  if (typeof v !== 'string') throw new Bad(f, `${label}을(를) 글자로 적어 주세요`);
  if ([...v].length > max) throw new Bad(f, `${label}은(는) ${max}자까지 쓸 수 있어요`);
  if (opts.required && !v.trim()) throw new Bad(f, `${label}을(를) 적어 주세요`);
}
function int(o: Record<string, unknown>, k: string, min: number, max: number, label: string, nullable = false) {
  const v = o[k];
  if (v === null && nullable) return;
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) throw new Bad(k, `${label}은(는) ${min}~${max} 사이 정수로 정해 주세요`);
}
function subset<T extends string>(o: Record<string, unknown>, k: string, values: readonly T[], label: string): T[] {
  const v = o[k];
  if (!Array.isArray(v) || v.some((x) => !values.includes(x)) || new Set(v).size !== v.length) throw new Bad(k, `${label} 값이 올바르지 않아요`);
  return v as T[];
}

const SLOTS: readonly BlockSlot[] = ['top', 'after_common', 'bottom', 'none'];
const MISSION_CYCLES: readonly MissionCycle[] = ['daily', 'weekly', 'whole', 'dated'];
const RECORD_CYCLES: readonly RecordCycle[] = ['daily', 'thrice_weekly', 'weekly', 'once_end'];
const RECORD_FIELDS: readonly RecordField[] = ['check', 'memo', 'photo', 'number', 'webtool'];
const SIG_FIELDS: readonly SignatureField[] = ['nickname', 'region', 'realname', 'opinion'];

function checkCommon(s: Record<string, unknown>) {
  oneOf(s, 'mode', ['online', 'offline', 'hybrid'], '방식');
  oneOf(s, 'hostLink', ['linked', 'none'], '주최 모임 연결');
  if (!isObj(s.slots)) throw new Bad('slots', '맞춤 영역 위치 값이 올바르지 않아요');
  for (const screen of BLOCK_SCREENS) oneOf(s.slots, screen, SLOTS, '맞춤 영역 위치', 'slots.');
  if (s.blockToolId !== null && (typeof s.blockToolId !== 'string' || !s.blockToolId)) throw new Bad('blockToolId', '맞춤 영역 웹 도구가 올바르지 않아요');
  bool(s, 'heroEnabled', '홈 히어로');
}

function checkPractice(s: Record<string, unknown>) {
  int(s, 'capacity', 1, 100000, '정원', true);
  if (typeof s.reminderTime !== 'string' || !HHMM_RE.test(s.reminderTime)) throw new Bad('reminderTime', '미션 알림 시각이 올바르지 않아요');
  if (!isObj(s.startPoint)) throw new Bad('startPoint', '출발점 설정이 올바르지 않아요');
  bool(s.startPoint, 'enabled', '출발점 받기', 'startPoint.');
  if (typeof s.startPoint.toolId !== 'string' || (s.startPoint.enabled && !s.startPoint.toolId)) throw new Bad('startPoint.toolId', '출발점 도구를 골라 주세요');
  if (!Array.isArray(s.extraConsents) || s.extraConsents.length > 5) throw new Bad('extraConsents', '추가 동의 항목은 5개까지 넣을 수 있어요');
  s.extraConsents.forEach((c, i) => {
    if (typeof c !== 'string' || !c.trim() || [...c].length > 40) throw new Bad(`extraConsents[${i}]`, '추가 동의 항목은 1~40자로 써 주세요');
  });
  bool(s, 'recordEnabled', '기록 받기');
  oneOf(s, 'missionCycle', MISSION_CYCLES, '미션 주기');
  oneOf(s, 'recordCycle', RECORD_CYCLES, '기록 주기');
  const fields = subset(s, 'recordFields', RECORD_FIELDS, '기록 항목');
  if (s.recordEnabled && !fields.includes('check')) throw new Bad('recordFields', '실천 체크는 꼭 넣어야 해요');
  if (s.recordEnabled && fields.includes('number')) text(s, 'numberUnit', 10, '숫자 단위', { required: true });
  else text(s, 'numberUnit', 10, '숫자 단위', { optional: true });
  if (s.numberGoal !== undefined && (typeof s.numberGoal !== 'number' || !Number.isFinite(s.numberGoal) || s.numberGoal <= 0)) throw new Bad('numberGoal', '목표값은 0보다 큰 숫자로 정해 주세요');
  const rt = s.recordToolId;
  if (rt !== undefined && rt !== null && typeof rt !== 'string') throw new Bad('recordToolId', '기록 웹 도구가 올바르지 않아요');
  if (s.recordEnabled && fields.includes('webtool') && !rt) throw new Bad('recordToolId', '「웹 도구로 기록」에 쓸 웹 도구를 골라 주세요');
  bool(s, 'missedAlert', '미기록 알림');
}

function checkSignature(s: Record<string, unknown>) {
  text(s, 'demandSummary', 1000, '요구안 요약');
  if (s.explainerPostId !== null && typeof s.explainerPostId !== 'string') throw new Bad('explainerPostId', '설명 글이 올바르지 않아요');
  int(s, 'goal', 1, 10_000_000, '목표 인원');
  oneOf(s, 'countDisplay', ['count_and_rate', 'count', 'hidden'], '서명 수 공개');
  const f = subset(s, 'fields', SIG_FIELDS, '받는 정보');
  if (!f.includes('nickname') || !f.includes('region')) throw new Bad('fields', '활동명과 사는 지역은 꼭 받아야 해요');
  oneOf(s, 'hostJoin', ['ask', 'auto', 'none'], '주최 모임 가입');
  bool(s, 'regionalCounts', '지역별 서명 수');
  bool(s, 'goalAlerts', '목표 달성 알림');
  bool(s, 'deliveryNotice', '전달 결과 공지');
  text(s, 'deliveryTarget', 100, '전달처');
}

function checkOffline(s: Record<string, unknown>) {
  if (!isObj(s.place)) throw new Bad('place', '장소가 올바르지 않아요');
  text(s.place, 'exact', 200, '정확한 주소', { prefix: 'place.' });
  text(s.place, 'public', 100, '공개용 위치', { prefix: 'place.' });
  for (const k of ['lat', 'lng'] as const) {
    const v = s.place[k];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) throw new Bad(`place.${k}`, '지도 위치가 올바르지 않아요');
  }
  int(s, 'capacity', 1, 10000, '정원');
  bool(s, 'waitlist', '대기 신청');
  bool(s, 'askCompanions', '동반 인원');
  bool(s, 'askTransport', '이동 수단');
  text(s, 'customQuestion', 100, '직접 추가한 질문', { optional: true });
  bool(s, 'photoConsent', '사진 동의');
  text(s, 'supplies', 200, '준비물');
  oneOf(s, 'attendance', ['qr', 'roster', 'none'], '출석 확인');
  bool(s, 'preNotice', '모임 전 안내');
  bool(s, 'changeNotice', '일정 변경 공지');
  bool(s, 'reviewRequest', '후기 요청');
}

function run(fn: () => void): Validation {
  try {
    fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, field: e.field, message: e.message };
    throw e;
  }
}

export function validateSettings(type: CampaignType, s: unknown): Validation {
  return run(() => {
    if (!isObj(s)) throw new Bad('settings', '설정 형식이 올바르지 않아요');
    checkCommon(s);
    if (type === 'practice') checkPractice(s);
    else if (type === 'signature') checkSignature(s);
    else if (type === 'offline') checkOffline(s);
    else throw new Bad('type', '캠페인 유형이 올바르지 않아요');
  });
}

// ---- schedule ---------------------------------------------------------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isISODate(v: unknown): v is ISODate {
  if (typeof v !== 'string' || !ISO_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const REQUIRED_SCHEDULE: Record<CampaignType, readonly (keyof Schedule)[]> = {
  practice: ['recruitStart', 'recruitEnd', 'runStart', 'runDays'],
  signature: ['recruitStart', 'recruitEnd'],
  offline: ['recruitStart', 'recruitEnd', 'eventDate', 'eventStart', 'eventEnd'],
};

/** Format + ordering checks; with `complete`, the type's required dates must be present (publish). */
export function validateSchedule(type: CampaignType, s: unknown, complete: boolean): Validation {
  return run(() => {
    if (!isObj(s)) throw new Bad('schedule', '일정 형식이 올바르지 않아요');
    for (const k of SCHEDULE_KEYS) {
      const v = s[k];
      const f = `schedule.${k}`;
      if (v === null || v === undefined) continue;
      if (k === 'runDays') {
        if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 365) throw new Bad(f, '진행 기간은 1~365일로 정해 주세요');
      } else if (k.endsWith('Time') || k === 'eventStart' || k === 'eventEnd') {
        if (typeof v !== 'string' || !HHMM_RE.test(v)) throw new Bad(f, '시각 형식이 올바르지 않아요');
      } else if (!isISODate(v)) throw new Bad(f, '날짜 형식이 올바르지 않아요');
    }
    if (complete) {
      for (const k of REQUIRED_SCHEDULE[type]) if (s[k] === null || s[k] === undefined) throw new Bad(`schedule.${k}`, '일정을 모두 정해 주세요');
    }
    const lt = (a: keyof Schedule, b: keyof Schedule, strict: boolean, msg: string) => {
      const x = s[a], y = s[b];
      if (x == null || y == null) return;
      if (strict ? !((x as string) < (y as string)) : (x as string) > (y as string)) throw new Bad(`schedule.${b}`, msg);
    };
    lt('recruitStart', 'recruitEnd', false, '모집 마감은 모집 시작 뒤여야 해요');
    if (s.recruitStart != null && s.recruitStart === s.recruitEnd) lt('recruitStartTime', 'recruitEndTime', true, '모집 마감은 모집 시작 뒤여야 해요');
    if (type === 'practice') lt('recruitEnd', 'runStart', false, '진행 시작은 모집 마감 뒤여야 해요');
    if (type === 'offline') {
      lt('recruitEnd', 'eventDate', false, '모임 날짜는 모집 마감 뒤여야 해요');
      lt('eventStart', 'eventEnd', true, '끝나는 시각은 시작 시각 뒤여야 해요');
    }
    if (type === 'signature') lt('recruitEnd', 'deliveryDate', false, '전달 예정일은 서명 마감 뒤여야 해요');
  });
}

// ---- missions ---------------------------------------------------------------

export const MISSION_TITLE_MAX = 40;

/** Mission list checks against the campaign's mission cycle (and run length when known). */
export function validateMissions(cycle: MissionCycle, missions: unknown, schedule: Partial<DraftSchedule>): Validation {
  return run(() => {
    if (!Array.isArray(missions)) throw new Bad('missions', '미션 목록 형식이 올바르지 않아요');
    if (missions.length > 366) throw new Bad('missions', '미션이 너무 많아요');
    if (cycle === 'whole' && missions.length > 1) throw new Bad('missions', '「기간 내내 하나」는 미션을 하나만 넣어요');
    const runDays = schedule.runDays ?? null;
    const runStart = schedule.runStart ?? null;
    const maxRound = runDays ? (cycle === 'weekly' ? Math.ceil(runDays / 7) : cycle === 'daily' ? runDays : 1) : null;
    const seen = new Set<string>();
    missions.forEach((m, i) => {
      const p = `missions[${i}].`;
      if (!isObj(m)) throw new Bad(`missions[${i}]`, '미션 형식이 올바르지 않아요');
      text(m, 'title', MISSION_TITLE_MAX, '미션', { required: true, prefix: p });
      text(m, 'category', 20, '분류', { prefix: p });
      text(m, 'description', 500, '설명', { optional: true, prefix: p });
      if (!Array.isArray(m.extraFields) || m.extraFields.some((f) => !RECORD_FIELDS.includes(f) || f === 'check') || new Set(m.extraFields).size !== m.extraFields.length) {
        throw new Bad(p + 'extraFields', '미션별 기록 항목이 올바르지 않아요');
      }
      let key: string;
      if (cycle === 'dated') {
        if (!isISODate(m.date)) throw new Bad(p + 'date', '미션 날짜를 정해 주세요');
        if (runStart && runDays) {
          const off = diffDays(runStart, m.date);
          if (off < 0 || off >= runDays) throw new Bad(p + 'date', '미션 날짜가 진행 기간 밖이에요');
        }
        key = m.date;
      } else {
        const r = cycle === 'whole' ? (m.round ?? 1) : m.round;
        if (!Number.isInteger(r) || (r as number) < 1) throw new Bad(p + 'round', '회차를 정해 주세요');
        if (maxRound !== null && (r as number) > maxRound) throw new Bad(p + 'round', `회차는 ${maxRound}까지 넣을 수 있어요`);
        key = String(r);
      }
      if (seen.has(key)) throw new Bad(p + (cycle === 'dated' ? 'date' : 'round'), '같은 회차(날짜)에 미션이 둘 있어요');
      seen.add(key);
    });
  });
}

export type MissionInput = Omit<Mission, 'id'> & { id?: string };
