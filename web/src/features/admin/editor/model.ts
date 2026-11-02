import { addDays, koShort } from '@shared/date';
import { recordSlots, type Mission } from '@shared/missions';
import {
  CALCULATOR_TOOL_ID, defaultSettings, emptySchedule,
  type BlockScreen, type CampaignSettings, type DraftSchedule, type OfflineSettings, type PracticeSettings, type SignatureSettings,
} from '@shared/campaignSettings';
import type { CampaignType, ISODate, MissionCycle, PublishMode, RecordCycle, RecordField } from '@shared/types';

export { CALCULATOR_TOOL_ID };
export type { BlockScreen, CampaignSettings, DraftSchedule, OfflineSettings, PracticeSettings, SignatureSettings };

/** 편집 화면이 들고 있는 캠페인 초안 (공통 정보 + 유형별 설정). */
export interface EditorDraft {
  type: CampaignType;
  title: string;
  summary: string;
  imageFileId: string | null;
  hostGroupId: string | null;
  hostName: string | null;
  schedule: DraftSchedule;
  settings: CampaignSettings;
  publishMode: PublishMode;
  showUpcoming: boolean;
}

export interface CustomItem { label: string; linkType: 'post' | 'tool' | 'url'; target: string; targetLabel?: string }
export interface EditorFile { id: string; name: string; mime: string; bytes: number; exclusive: boolean }
export interface EditorTool { toolId: string; name: string; exclusive: boolean }
export interface Explainer { id: string; title: string; body: string; attachments: Array<{ id: string; name: string; mime: string; bytes: number }>; createdAt: string; simDate?: string | null }

/** GET /api/tools (관리자) 한 줄 */
export interface AdminTool {
  id: string; name: string; slug: string | null; kind: 'block' | 'page';
  published: { version: number; manifest: { startPoint?: boolean; saveKeys?: string[] } } | null;
  versions?: Array<{ version: number; status: string; manifest?: { startPoint?: boolean } }>;
}

export const CALCULATOR_TOOL: AdminTool = { id: CALCULATOR_TOOL_ID, name: '1.5도 계산기', slug: 'calculator', kind: 'page', published: { version: 1, manifest: { startPoint: true } } };

export function toolVersionLabel(t: AdminTool): string {
  if (t.id === CALCULATOR_TOOL_ID) return '기본 도구 · 게시 중';
  const latest = t.versions?.[0];
  if (t.published && (!latest || latest.version === t.published.version)) return `v${t.published.version} · 게시 중`;
  if (latest) return `v${latest.version} · ${latest.status === 'pending' ? '게시 대기' : latest.status === 'published' ? '게시 중' : '지난 버전'}`;
  return t.published ? `v${t.published.version} · 게시 중` : '게시 전';
}

export const newDraft = (type: CampaignType): EditorDraft => ({
  type, title: '', summary: '', imageFileId: null, hostGroupId: null, hostName: null,
  schedule: emptySchedule(), settings: defaultSettings(type), publishMode: 'scheduled', showUpcoming: true,
});

const COMMON_KEYS = ['mode', 'hostLink', 'slots', 'blockToolId', 'heroEnabled'] as const;

/** 유형을 바꿀 때: 공통 설정만 남기고 유형별 설정은 기본값으로. */
export function switchType(d: EditorDraft, type: CampaignType): EditorDraft {
  const next = defaultSettings(type) as unknown as Record<string, unknown>;
  const cur = d.settings as unknown as Record<string, unknown>;
  for (const k of COMMON_KEYS) next[k] = cur[k];
  const slots = { ...(cur.slots as Record<BlockScreen, string>) };
  return { ...d, type, settings: { ...(next as unknown as CampaignSettings), slots } as CampaignSettings };
}

/** 유형별 설정을 기본값에서 바꿨는지 (바꾸면 유형 전환 전에 묻는다). */
export function typeSpecificEdited(d: EditorDraft): boolean {
  const strip = (s: CampaignSettings) => {
    const o = { ...(s as unknown as Record<string, unknown>) };
    for (const k of [...COMMON_KEYS, 'explainerPostId']) delete o[k];
    return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  };
  return strip(d.settings) !== strip(defaultSettings(d.type));
}

// ---- labels -----------------------------------------------------------------

export const MISSION_CYCLE_LABEL: Record<MissionCycle, string> = { daily: '매일 바뀜', weekly: '주마다 바뀜', whole: '기간 내내 하나', dated: '날짜 지정' };
export const RECORD_CYCLE_LABEL: Record<RecordCycle, string> = { daily: '매일', thrice_weekly: '주 3회', weekly: '주 1회', once_end: '마무리 때 한 번' };
export const RECORD_FIELD_LABEL: Record<RecordField, string> = { check: '실천 체크 (필수)', memo: '한 줄 메모', photo: '사진', number: '숫자 (km · kWh 등)', webtool: '웹 도구로 기록' };
export const SLOT_LABEL: Record<string, string> = { top: '① 맨 위', after_common: '② 공통 정보 다음', bottom: '③ 맨 아래', none: '놓지 않음' };

export function screenLabel(type: CampaignType, s: BlockScreen): string {
  if (type === 'offline') return ({ detail: '캠페인 상세', before: '신청 완료', event: '당일', after: '끝난 뒤' } as Record<string, string>)[s] ?? s;
  if (type === 'signature') return ({ detail: '캠페인 상세', signed: '서명 완료', closed: '마감 · 전달 결과' } as Record<string, string>)[s] ?? s;
  return ({ detail: '캠페인 상세', before: '시작 전', running: '진행 중', final: '마무리' } as Record<string, string>)[s] ?? s;
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
export function weekdayOf(d: ISODate): string {
  const [y, m, day] = d.split('-').map(Number);
  return WEEKDAY[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
}

export function runLength(days: number): string {
  return days % 7 === 0 ? `${days / 7}주` : `${days}일`;
}

/** 미션 개수: 주기에서 계산(날짜 지정은 등록한 개수). */
export function missionCount(cycle: MissionCycle, runDays: number, registered: number): number {
  if (cycle === 'daily') return runDays;
  if (cycle === 'weekly') return Math.ceil(runDays / 7);
  if (cycle === 'whole') return 1;
  return registered;
}

/** 「참가자에게는 이렇게 보여요」 — 미션 주기 · 기록 주기 · 기간에서 만든 한 문장. */
export function summarySentence(s: Pick<PracticeSettings, 'missionCycle' | 'recordCycle' | 'recordEnabled'>, schedule: Pick<DraftSchedule, 'runStart' | 'runDays'>, registered = 0): string {
  if (!s.recordEnabled) return '참가자는 신청만 하고, 미션 기록은 받지 않아요';
  const day = schedule.runStart ? `${weekdayOf(schedule.runStart)}요일` : '진행 시작 요일';
  const mission = {
    daily: '미션은 매일 바뀌고',
    weekly: `미션은 매주 ${day}에 바뀌고`,
    whole: '미션은 기간 내내 하나이고',
    dated: '미션은 정한 날짜에 열리고',
  }[s.missionCycle];
  const obj = { daily: '그날 미션을', weekly: '그 주 미션을', whole: '미션을', dated: '미션을' }[s.missionCycle];
  const when = { daily: '매일', thrice_weekly: '주 3번', weekly: '주 1번', once_end: '마무리 때 한 번' }[s.recordCycle];
  const first = `${mission}, ${when} ${obj} 실천했는지 체크해요`;
  const { runStart, runDays } = schedule;
  if (!runStart || !runDays) return first;
  const n = missionCount(s.missionCycle, runDays, registered);
  const records = recordSlots(s.recordCycle, runStart, runDays).length;
  return `${first} · ${runLength(runDays)} 동안 미션 ${n}개, 기록 ${records}번`;
}

/** 상태 사슬: 일정에 따라 바뀌는 단계와 날짜. */
export function statusChain(type: CampaignType, s: DraftSchedule): Array<{ label: string; date?: string }> {
  const out: Array<{ label: string; date?: string }> = [{ label: '모집 예정' }];
  out.push({ label: '모집 중', date: s.recruitStart ? md(s.recruitStart) : undefined });
  if (type === 'practice') {
    out.push({ label: '진행 중', date: s.runStart ? md(s.runStart) : undefined });
    out.push({ label: '마감', date: s.runStart && s.runDays ? md(addDays(s.runStart, s.runDays)) : undefined });
  } else if (type === 'offline') {
    out.push({ label: '진행 중', date: s.eventDate ? md(s.eventDate) : undefined });
    out.push({ label: '마감', date: s.eventDate ? `${md(s.eventDate)}${s.eventEnd ? ` ${s.eventEnd}` : ''}` : undefined });
  } else {
    out.push({ label: '마감', date: s.recruitEnd ? md(addDays(s.recruitEnd, 1)) : undefined });
  }
  return out;
}

export function md(d: ISODate): string {
  const [, m, day] = d.split('-').map(Number);
  return `${m}. ${day}.`;
}

export function koDateTime(d: ISODate | null, t?: string | null): string {
  if (!d) return '';
  const [y] = d.split('-');
  return `${y}. ${koShort(d)}${t ? ` ${t}` : ''}`;
}

/** 자동으로 생기는 체크리스트 항목(서버 checklistBase와 같은 규칙). */
export function autoChecklist(d: EditorDraft, missions: number, materials: number): Array<{ label: string; when: string; active: boolean }> {
  if (d.type === 'practice') {
    const s = d.settings as PracticeSettings;
    return [
      { label: '출발점 재기', when: '출발점 받기를 켰을 때', active: s.startPoint.enabled },
      { label: '미션 알림 켜기', when: '항상', active: true },
      { label: '참가자 게시판에 인사 남기기', when: '항상', active: true },
      { label: '첫 미션 미리 보기', when: '미션을 등록했을 때', active: missions > 0 },
    ];
  }
  if (d.type === 'signature') {
    return [
      { label: '친구에게 공유하기', when: '항상', active: true },
      { label: '주최 모임 둘러보기', when: '주최 모임을 연결했을 때', active: !!d.hostGroupId },
      { label: '전달 결과 알림 받기', when: '항상', active: true },
      { label: '관련 자료 읽기', when: '쓰는 자료를 붙였을 때', active: materials > 0 },
    ];
  }
  const s = d.settings as OfflineSettings;
  return [
    { label: '장소와 오는 길 확인', when: '항상', active: true },
    { label: '일정을 내 캘린더에 넣기', when: '항상', active: true },
    { label: '참가자 게시판에 인사 남기기', when: '항상', active: true },
    { label: '준비물 확인', when: '준비물을 적었을 때', active: !!s.supplies.trim() },
  ];
}

export function reminderLabel(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const part = h < 12 ? '아침' : h < 18 ? '낮' : '저녁';
  const hh = h > 12 ? h - 12 : h;
  return `매일 ${part} ${hh}시${m ? ` ${m}분` : ''}`;
}

export type MissionDraft = Omit<Mission, 'id'> & { id?: string };
