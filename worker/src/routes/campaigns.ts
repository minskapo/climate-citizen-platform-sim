import { nanoid } from 'nanoid';
import { campaignStatus, participantPhase, runEnd, type StatusInput } from '@shared/campaignStatus';
import { addDays, diffDays } from '@shared/date';
import type { Mission } from '@shared/missions';
import type { CampaignStatus, CampaignType, MissionCycle, PublishMode, RecordField, Schedule } from '@shared/types';
import { checkFileSize } from '@shared/validate';
import {
  CALCULATOR_TOOL_ID, cleanSettings, defaultSettings, emptySchedule, SCHEDULE_KEYS, validateMissions, validateSchedule, validateSettings,
  type CampaignSettings, type DraftSchedule, type OfflineSettings, type PracticeSettings, type SignatureSettings, type Validation,
} from '../campaignSettings';
import { fail, json, type Ctx, type Handler } from '../db';
import { getGroup, isStaffRole, memberRole } from './groups';
import { promoteWaitlist, signatureNo } from './participations';
import { decodeBase64 } from './posts';
import { page, PAGE_SIZE, parseCursor, readBody, requireUser, str } from './common';

export const IGT_NAME = '녹색전환연구소';
const TYPES: readonly CampaignType[] = ['practice', 'signature', 'offline'];
const MODES: readonly PublishMode[] = ['now', 'scheduled', 'draft'];
const TITLE_MAX = 30;
const SUMMARY_MAX = 80;

export interface CampaignRow {
  id: string;
  created_at: string;
  type: CampaignType;
  title: string;
  summary: string;
  image_file_id: string | null;
  host_group_id: string | null;
  schedule_json: string;
  settings_json: string;
  publish: PublishMode;
  show_upcoming: number;
  hero: number;
  created_by: string | null;
}

interface MissionRow { id: string; round: number | null; date: string | null; category: string; title: string; description: string; fields_json: string; position: number }

// ---- helpers ----------------------------------------------------------------

const isAdmin = (ctx: Ctx) => ctx.role === 'admin';
const adminOnly = () => fail(403, 'ADMIN_ONLY', '관리자만 할 수 있어요');
const notFound = () => fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');

export function invalid(field: string, message: string): Response {
  return json({ error: { code: 'INVALID_SETTINGS', message, field } }, 400);
}
const fromV = (v: Validation) => (v.ok ? null : invalid(v.field, v.message));

async function readArray(req: Request): Promise<unknown[] | null> {
  try {
    const b = await req.json();
    return Array.isArray(b) ? b : null;
  } catch {
    return null;
  }
}

export const scheduleOf = (r: CampaignRow): DraftSchedule => ({ ...emptySchedule(), ...JSON.parse(r.schedule_json || '{}') });
export const settingsOf = (r: CampaignRow): CampaignSettings => ({ ...defaultSettings(r.type), ...JSON.parse(r.settings_json || '{}') });

export function statusInput(r: CampaignRow): StatusInput {
  const s = scheduleOf(r);
  const schedule = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null)) as unknown as Schedule;
  return { type: r.type, publish: r.publish, showUpcoming: !!r.show_upcoming, schedule };
}

export const statusOf = (ctx: Ctx, r: CampaignRow): CampaignStatus => campaignStatus(statusInput(r), ctx.simDate);

/** Drafts: admins only. 모집 예정: only with showUpcoming (or 바로 공개). */
export function visibleTo(ctx: Ctx, r: CampaignRow, st = statusOf(ctx, r)): boolean {
  if (isAdmin(ctx)) return true;
  if (st === 'draft') return false;
  if (st === 'scheduled') return !!r.show_upcoming || r.publish === 'now';
  return true;
}

async function loadCampaign(ctx: Ctx, id: string): Promise<CampaignRow | null> {
  return ctx.db.first<CampaignRow>('SELECT * FROM campaigns WHERE id = ?', id);
}

async function loadForAdmin(ctx: Ctx, id: string): Promise<CampaignRow | Response> {
  if (!isAdmin(ctx)) return adminOnly();
  return (await loadCampaign(ctx, id)) ?? notFound();
}

async function hostOf(ctx: Ctx, r: CampaignRow) {
  if (r.host_group_id) {
    const g = await getGroup(ctx, r.host_group_id);
    if (g) return { type: 'group' as const, id: g.id, name: g.name };
  }
  return { type: 'igt' as const, name: IGT_NAME };
}

/** Participant (not cancelled), host-group staff or admin — may use 캠페인 전용 files/tools. */
export async function canUseExclusive(ctx: Ctx, campaignId: string, hostGroupId: string | null): Promise<boolean> {
  if (isAdmin(ctx)) return true;
  if (ctx.userId) {
    const part = await ctx.db.first("SELECT id FROM participations WHERE campaign_id = ? AND user_id = ? AND state <> 'cancelled'", campaignId, ctx.userId);
    if (part) return true;
  }
  if (!hostGroupId) return false;
  return isStaffRole(ctx, hostGroupId, await memberRole(ctx, hostGroupId, ctx.userId));
}

async function toolExists(ctx: Ctx, id: string): Promise<boolean> {
  return id === CALCULATOR_TOOL_ID || !!(await ctx.db.first('SELECT id FROM tools WHERE id = ?', id));
}

const missionView = (m: MissionRow): Mission => ({
  id: m.id, round: m.round, date: m.date, category: m.category, title: m.title,
  ...(m.description ? { description: m.description } : {}), extraFields: JSON.parse(m.fields_json) as RecordField[],
});

export async function missionsOf(ctx: Ctx, campaignId: string): Promise<Mission[]> {
  const rows = await ctx.db.all<MissionRow>('SELECT * FROM missions WHERE campaign_id = ? ORDER BY position, round, date, id', campaignId);
  return rows.map(missionView);
}

/** Missions of several campaigns in one query (grouped by campaign id). */
export async function missionsByCampaign(ctx: Ctx, ids: string[]): Promise<Map<string, Mission[]>> {
  const out = new Map<string, Mission[]>();
  if (!ids.length) return out;
  const rows = await ctx.db.all<MissionRow & { campaign_id: string }>(
    `SELECT * FROM missions WHERE campaign_id IN (${ids.map(() => '?').join(',')}) ORDER BY position, round, date, id`, ...ids);
  for (const r of rows) out.set(r.campaign_id, [...(out.get(r.campaign_id) ?? []), missionView(r)]);
  return out;
}

// ---- views ------------------------------------------------------------------

async function campaignView(ctx: Ctx, r: CampaignRow, showExact: boolean) {
  const settings = settingsOf(r);
  if (r.type === 'offline' && !showExact) {
    const p = (settings as OfflineSettings).place;
    (settings as OfflineSettings).place = { exact: '', public: p.public };
  }
  return {
    id: r.id, type: r.type, title: r.title, summary: r.summary, imageFileId: r.image_file_id,
    host: await hostOf(ctx, r), hostGroupId: r.host_group_id, schedule: scheduleOf(r), settings,
    publish: r.publish, showUpcoming: !!r.show_upcoming, hero: !!r.hero, createdAt: r.created_at,
  };
}

interface ChecklistEntry { key: string; kind: 'auto' | 'custom'; label: string; linkType?: 'post' | 'tool' | 'url'; target?: string; done: boolean }

interface MyChecklistState { id: string; start_measurement_id: string | null; answers_json: string; checklist_json: string; state: string }

/** Auto items (설계 6.3 · M-2 · M-2s · M-2o) + admin items, with the caller's completion. */
async function checklistOf(
  ctx: Ctx, r: CampaignRow, settings: CampaignSettings, missionCount: number, materialCount: number, mine: MyChecklistState | null = null,
): Promise<ChecklistEntry[]> {
  const out = await checklistBase(ctx, r, settings, missionCount, materialCount);
  if (!mine || mine.state === 'cancelled' || !ctx.userId) return out;
  const marked = JSON.parse(mine.checklist_json || '{}') as Record<string, boolean>;
  const answers = JSON.parse(mine.answers_json || '{}') as { reminder?: { enabled?: boolean } };
  const startDone = !!mine.start_measurement_id || !!(await ctx.db.first(
    "SELECT id FROM measurements WHERE user_id = ? AND campaign_id = ? AND kind = 'start'", ctx.userId, r.id));
  const greetDone = !!(await ctx.db.first(
    "SELECT id FROM posts WHERE board_type = 'campaign' AND board_id = ? AND author_id = ? AND category <> 'explainer'", r.id, ctx.userId));
  for (const e of out) {
    if (e.key === 'start_point') e.done = startDone;
    else if (e.key === 'reminder') e.done = !!answers.reminder?.enabled;
    else if (e.key === 'greet') e.done = greetDone || !!marked.greet;
    else e.done = !!marked[e.key];
  }
  return out;
}

/** Keys a participant may mark done via POST /checklist/:itemId/done. */
export async function checklistKeys(ctx: Ctx, r: CampaignRow): Promise<string[]> {
  const missions = await missionsOf(ctx, r.id);
  const materials = (await filesOf(ctx, r.id)).length + (await toolsOf(ctx, r.id)).length;
  return (await checklistBase(ctx, r, settingsOf(r), missions.length, materials)).map((e) => e.key);
}

async function checklistBase(ctx: Ctx, r: CampaignRow, settings: CampaignSettings, missionCount: number, materialCount: number): Promise<ChecklistEntry[]> {
  const auto = (key: string, label: string): ChecklistEntry => ({ key, kind: 'auto', label, done: false });
  const out: ChecklistEntry[] = [];
  if (r.type === 'practice') {
    const s = settings as PracticeSettings;
    if (s.startPoint.enabled) out.push(auto('start_point', '출발점 재기'));
    out.push(auto('reminder', '미션 알림 켜기'), auto('greet', '참가자 게시판에 인사 남기기'));
    if (missionCount > 0) out.push(auto('first_mission', '첫 미션 미리 보기'));
  } else if (r.type === 'signature') {
    out.push(auto('share', '친구에게 공유하기'));
    if (r.host_group_id) out.push(auto('browse_host', '주최 모임 둘러보기'));
    out.push(auto('delivery_alert', '전달 결과 알림 받기'));
    if (materialCount > 0) out.push(auto('related_materials', '관련 자료 읽기'));
  } else {
    const s = settings as OfflineSettings;
    out.push(auto('place', '장소와 오는 길 확인'), auto('calendar', '일정을 내 캘린더에 넣기'), auto('greet', '참가자 게시판에 인사 남기기'));
    if (s.supplies.trim()) out.push(auto('supplies', '준비물 확인'));
  }
  const custom = await ctx.db.all<{ id: string; text: string; link_type: 'post' | 'tool' | 'url'; target: string }>(
    'SELECT id, text, link_type, target FROM checklist_items WHERE campaign_id = ? ORDER BY position, id', r.id,
  );
  for (const c of custom) out.push({ key: c.id, kind: 'custom', label: c.text, linkType: c.link_type, target: c.target, done: false });
  return out;
}

async function filesOf(ctx: Ctx, campaignId: string) {
  return ctx.db.all<{ id: string; name: string; mime: string; bytes: number; exclusive: number }>(
    'SELECT f.id, cf.name, f.mime, f.bytes, cf.exclusive FROM campaign_files cf JOIN files f ON f.id = cf.file_id WHERE cf.campaign_id = ? ORDER BY cf.created_at, cf.id',
    campaignId,
  ).then((rows) => rows.map((f) => ({ ...f, exclusive: !!f.exclusive })));
}

async function toolsOf(ctx: Ctx, campaignId: string) {
  const rows = await ctx.db.all<{ tool_id: string; exclusive: number; name: string | null }>(
    'SELECT ct.tool_id, ct.exclusive, t.name FROM campaign_tools ct LEFT JOIN tools t ON t.id = ct.tool_id WHERE ct.campaign_id = ? ORDER BY ct.created_at, ct.id',
    campaignId,
  );
  return rows.map((t) => ({ toolId: t.tool_id, name: t.tool_id === CALCULATOR_TOOL_ID ? '1.5도 계산기' : t.name ?? '', exclusive: !!t.exclusive }));
}

async function explainerOf(ctx: Ctx, settings: CampaignSettings) {
  const pid = (settings as SignatureSettings).explainerPostId;
  if (!pid) return null;
  const p = await ctx.db.first<{ id: string; title: string; body: string; attachments_json: string; created_at: string; sim_date: string | null }>(
    'SELECT id, title, body, attachments_json, created_at, sim_date FROM posts WHERE id = ?', pid,
  );
  return p ? { id: p.id, title: p.title, body: p.body, attachments: JSON.parse(p.attachments_json), createdAt: p.created_at, simDate: p.sim_date } : null;
}

const ACTIVE = "state NOT IN ('cancelled','waitlisted')";

async function countsOf(ctx: Ctx, r: CampaignRow, settings: CampaignSettings) {
  const a = (await ctx.db.first<{ n: number; seats: number | null }>(`SELECT COUNT(*) n, SUM(1 + companions) seats FROM participations WHERE campaign_id = ? AND ${ACTIVE}`, r.id))!;
  const w = (await ctx.db.first<{ n: number }>("SELECT COUNT(*) n FROM participations WHERE campaign_id = ? AND state = 'waitlisted'", r.id))!;
  const capacity = r.type === 'signature' ? null : (settings as PracticeSettings | OfflineSettings).capacity;
  const taken = r.type === 'offline' ? a.seats ?? 0 : a.n;
  const sub = (await ctx.db.first<{ n: number }>('SELECT COUNT(*) n FROM campaign_subscriptions WHERE campaign_id = ?', r.id))!;
  return { participants: a.n, waitlisted: w.n, seatsTaken: taken, capacity, seatsLeft: capacity == null ? null : Math.max(0, capacity - taken), subscribers: sub.n };
}

/** 오프라인 지금 출석 인원(동반 포함). 신청이 확정된 참가자 · 운영진 · 관리자에게만 보인다. */
async function attendedOf(ctx: Ctx, r: CampaignRow, applicant: boolean): Promise<{ attendedCount?: number }> {
  if (r.type !== 'offline') return {};
  const staff = isAdmin(ctx) || (!!r.host_group_id && isStaffRole(ctx, r.host_group_id, await memberRole(ctx, r.host_group_id, ctx.userId)));
  if (!applicant && !staff) return {};
  const a = await ctx.db.first<{ n: number }>(
    "SELECT COALESCE(SUM(1 + p.companions), 0) n FROM attendance a JOIN participations p ON p.id = a.participation_id WHERE p.campaign_id = ? AND p.state = 'applied'", r.id);
  return { attendedCount: a?.n ?? 0 };
}

export async function detail(ctx: Ctx, r: CampaignRow) {
  const st = statusOf(ctx, r);
  const settings = settingsOf(r);
  const mine = ctx.userId
    ? await ctx.db.first<{ id: string; state: string; companions: number; waitlist_no: number | null; consents_json: string; answers_json: string; created_at: string; sim_date: string | null; start_measurement_id: string | null; checklist_json: string; transport: string; paused_from: string | null; paused_until: string | null; pause_used: number }>(
      'SELECT * FROM participations WHERE campaign_id = ? AND user_id = ?', r.id, ctx.userId)
    : null;
  const exclusiveOk = await canUseExclusive(ctx, r.id, r.host_group_id);
  const showExact = exclusiveOk || (!!mine && mine.state !== 'cancelled');
  const missions = await missionsOf(ctx, r.id);
  const files = (await filesOf(ctx, r.id)).filter((f) => exclusiveOk || !f.exclusive);
  const tools = (await toolsOf(ctx, r.id)).filter((t) => exclusiveOk || !t.exclusive);
  // 서명 캠페인: 내 서명이 몇 번째인지 · 내 공유 링크로 들어와 서명한 사람 수
  const sig = r.type === 'signature' && mine
    ? {
      signatureNo: await signatureNo(ctx, { id: mine.id, campaign_id: r.id, state: mine.state, created_at: mine.created_at }),
      referredCount: (await ctx.db.first<{ n: number }>("SELECT COUNT(*) n FROM participations WHERE campaign_id = ? AND shared_by = ? AND state = 'signed'", r.id, ctx.userId))?.n ?? 0,
    }
    : {};
  return {
    campaign: await campaignView(ctx, r, showExact),
    status: st,
    phase: st === 'draft' ? null : participantPhase(statusInput(r), ctx.simDate),
    counts: {
      ...(await countsOf(ctx, r, settings)),
      ...(await attendedOf(ctx, r, mine?.state === 'applied')),
    },
    myParticipation: mine
      ? { id: mine.id, state: mine.state, companions: mine.companions, waitlistNo: mine.waitlist_no, consents: JSON.parse(mine.consents_json), answers: JSON.parse(mine.answers_json), createdAt: mine.created_at, simDate: mine.sim_date, transport: mine.transport, startMeasurementId: mine.start_measurement_id, pausedFrom: mine.paused_from, pausedUntil: mine.paused_until, pauseUsed: !!mine.pause_used, paused: !!mine.paused_from && !!mine.paused_until && ctx.simDate >= mine.paused_from && ctx.simDate <= mine.paused_until, ...sig }
      : null,
    missions,
    checklist: await checklistOf(ctx, r, settings, missions.length, files.length + tools.length, mine),
    files,
    tools,
    explainer: r.type === 'signature' ? await explainerOf(ctx, settings) : null,
    subscribed: ctx.userId
      ? !!(await ctx.db.first('SELECT id FROM campaign_subscriptions WHERE campaign_id = ? AND user_id = ?', r.id, ctx.userId))
      : false,
  };
}

// ---- edits ------------------------------------------------------------------

interface Draft {
  type: CampaignType;
  title: string;
  summary: string;
  image_file_id: string | null;
  host_group_id: string | null;
  schedule: DraftSchedule;
  settings: CampaignSettings;
}

const draftOf = (r: CampaignRow): Draft => ({
  type: r.type, title: r.title, summary: r.summary, image_file_id: r.image_file_id, host_group_id: r.host_group_id,
  schedule: scheduleOf(r), settings: settingsOf(r),
});

const COMMON_KEYS = ['mode', 'slots', 'blockToolId', 'heroEnabled'] as const;
const OPTIONAL_SETTING_KEYS = ['numberUnit', 'numberGoal', 'customQuestion'] as const;

/** Applies a (partial) editor payload onto a draft. Settings merge shallowly over the current ones. */
async function applyEdits(ctx: Ctx, cur: Draft, body: Record<string, unknown>, locked: boolean): Promise<Draft | Response> {
  const d: Draft = { ...cur, schedule: { ...cur.schedule }, settings: { ...cur.settings } };
  if (body.type !== undefined && body.type !== cur.type) {
    if (!TYPES.includes(body.type as CampaignType)) return invalid('type', '캠페인 유형이 올바르지 않아요');
    if (locked) return invalid('type', '공개한 캠페인은 유형을 바꿀 수 없어요');
    d.type = body.type as CampaignType;
    const next = defaultSettings(d.type) as unknown as Record<string, unknown>;
    for (const k of COMMON_KEYS) next[k] = (cur.settings as unknown as Record<string, unknown>)[k];
    d.settings = next as unknown as CampaignSettings;
  }
  if (body.title !== undefined) {
    d.title = str(body.title);
    if ([...d.title].length > TITLE_MAX) return invalid('title', `캠페인 이름은 ${TITLE_MAX}자까지 쓸 수 있어요`);
  }
  if (body.summary !== undefined) {
    d.summary = str(body.summary);
    if ([...d.summary].length > SUMMARY_MAX) return invalid('summary', `설명은 ${SUMMARY_MAX}자까지 쓸 수 있어요`);
  }
  if (body.imageFileId !== undefined) {
    if (body.imageFileId !== null && (typeof body.imageFileId !== 'string' || !(await ctx.db.first('SELECT id FROM files WHERE id = ?', body.imageFileId)))) {
      return invalid('imageFileId', '대표 이미지를 찾을 수 없어요');
    }
    d.image_file_id = body.imageFileId as string | null;
  }
  if (body.hostGroupId !== undefined) {
    if (body.hostGroupId !== null) {
      const g = typeof body.hostGroupId === 'string' ? await getGroup(ctx, body.hostGroupId) : null;
      if (!g || g.closed_at) return invalid('hostGroupId', '주최 모임을 찾을 수 없어요');
    }
    d.host_group_id = body.hostGroupId as string | null;
  }
  if (body.schedule !== undefined) {
    if (!body.schedule || typeof body.schedule !== 'object') return invalid('schedule', '일정 형식이 올바르지 않아요');
    const s = body.schedule as Record<string, unknown>;
    for (const k of SCHEDULE_KEYS) if (s[k] !== undefined) (d.schedule as Record<string, unknown>)[k] = s[k];
  }
  if (body.settings !== undefined) {
    if (!body.settings || typeof body.settings !== 'object' || Array.isArray(body.settings)) return invalid('settings', '설정 형식이 올바르지 않아요');
    d.settings = { ...d.settings, ...(body.settings as object) } as CampaignSettings;
    // Optional keys: null clears them (a shallow merge cannot drop a key otherwise).
    const merged = d.settings as unknown as Record<string, unknown>;
    for (const k of OPTIONAL_SETTING_KEYS) if (merged[k] === null) delete merged[k];
  }
  const s = d.settings as unknown as Record<string, unknown>;
  s.hostLink = d.host_group_id ? 'linked' : 'none';
  if (d.type === 'signature') s.explainerPostId = (cur.settings as SignatureSettings).explainerPostId ?? null; // server-owned

  const bad = fromV(validateSchedule(d.type, d.schedule, locked)) ?? fromV(validateSettings(d.type, s));
  if (bad) return bad;
  d.settings = cleanSettings(d.type, s);

  if (d.settings.blockToolId && !(await toolExists(ctx, d.settings.blockToolId))) return invalid('blockToolId', '맞춤 영역 웹 도구를 찾을 수 없어요');
  if (d.type === 'practice') {
    const p = d.settings as PracticeSettings;
    if (p.startPoint.enabled && !(await toolExists(ctx, p.startPoint.toolId))) return invalid('startPoint.toolId', '출발점 도구를 찾을 수 없어요');
    if (p.recordToolId && !(await toolExists(ctx, p.recordToolId))) return invalid('recordToolId', '기록 웹 도구를 찾을 수 없어요');
  }
  return d;
}

/** Everything a live (non-draft) campaign needs. */
async function validatePublish(ctx: Ctx, id: string, d: Draft): Promise<Response | null> {
  if (!d.title) return invalid('title', '캠페인 이름을 적어 주세요');
  const v = fromV(validateSchedule(d.type, d.schedule, true)) ?? fromV(validateSettings(d.type, d.settings));
  if (v) return v;
  if (d.type === 'practice') {
    const p = d.settings as PracticeSettings;
    if (p.recordEnabled) {
      const missions = await missionsOf(ctx, id);
      if (missions.length === 0) return invalid('missions', '미션을 하나 이상 넣어 주세요');
      const mv = fromV(validateMissions(p.missionCycle, missions, d.schedule));
      if (mv) return mv;
    }
  }
  if (d.type === 'signature' && !(d.settings as SignatureSettings).demandSummary.trim()) return invalid('demandSummary', '요구안 요약을 적어 주세요');
  if (d.type === 'offline' && !(d.settings as OfflineSettings).place.public.trim()) return invalid('place.public', '공개용 위치를 적어 주세요');
  return null;
}

const writeDraft = (ctx: Ctx, id: string, d: Draft): Promise<unknown> =>
  ctx.db.run(
    'UPDATE campaigns SET type = ?, title = ?, summary = ?, image_file_id = ?, host_group_id = ?, schedule_json = ?, settings_json = ?, hero = ? WHERE id = ?',
    d.type, d.title, d.summary, d.image_file_id, d.host_group_id, JSON.stringify(d.schedule), JSON.stringify(d.settings), d.settings.heroEnabled ? 1 : 0, id,
  );

async function insertCampaign(ctx: Ctx, d: Draft): Promise<string> {
  const id = nanoid();
  await ctx.db.run(
    `INSERT INTO campaigns (id, created_at, type, title, summary, image_file_id, host_group_id, schedule_json, settings_json, publish, show_upcoming, hero, created_by, sim_date)
     VALUES (?,?,?,?,?,?,?,?,?,'draft',0,0,?,?)`,
    id, ctx.now, d.type, d.title, d.summary, d.image_file_id, d.host_group_id, JSON.stringify(d.schedule), JSON.stringify(d.settings), ctx.userId, ctx.simDate,
  );
  return id;
}

/** Creates a draft campaign (also used by collab 「캠페인 초안 만들기」). */
export async function createDraft(ctx: Ctx, body: Record<string, unknown>): Promise<string | Response> {
  const type = body.type as CampaignType;
  if (!TYPES.includes(type)) return invalid('type', '캠페인 유형을 골라 주세요');
  const base: Draft = { type, title: '', summary: '', image_file_id: null, host_group_id: null, schedule: emptySchedule(), settings: defaultSettings(type) };
  const d = await applyEdits(ctx, base, { ...body, type }, false);
  if (d instanceof Response) return d;
  return insertCampaign(ctx, d);
}

// ---- handlers: authoring ----------------------------------------------------

export const createCampaign: Handler = async (req, ctx) => {
  if (!isAdmin(ctx)) return adminOnly();
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const id = await createDraft(ctx, body);
  if (id instanceof Response) return id;
  return json(await detail(ctx, (await loadCampaign(ctx, id))!), 201);
};

export const updateCampaign: Handler = async (req, ctx, p) => {
  const r = await loadForAdmin(ctx, p.id);
  if (r instanceof Response) return r;
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const live = r.publish !== 'draft';
  const d = await applyEdits(ctx, draftOf(r), body, live);
  if (d instanceof Response) return d;
  if (live) {
    const bad = await validatePublish(ctx, r.id, d);
    if (bad) return bad;
  }
  await writeDraft(ctx, r.id, d);
  const after = (await loadCampaign(ctx, r.id))!;
  // Raised capacity (or waitlist rules changed) can free seats for waitlisted applicants.
  if (after.type === 'offline') await promoteWaitlist(ctx, after);
  return json(await detail(ctx, after));
};

export const publishCampaign: Handler = async (req, ctx, p) => {
  const r = await loadForAdmin(ctx, p.id);
  if (r instanceof Response) return r;
  const body = (await readBody(req)) ?? {};
  const mode = body.mode as PublishMode;
  if (!MODES.includes(mode)) return invalid('mode', '공개 방식을 골라 주세요');
  if (body.showUpcoming !== undefined && typeof body.showUpcoming !== 'boolean') return invalid('showUpcoming', '모집 예정 미리 보이기 값이 올바르지 않아요');
  if (body.hero !== undefined && typeof body.hero !== 'boolean') return invalid('hero', '홈 히어로 값이 올바르지 않아요');
  const d = draftOf(r);
  const showUpcoming = body.showUpcoming ?? !!r.show_upcoming;
  if (mode === 'draft') {
    await ctx.db.run(
      "UPDATE campaigns SET publish = 'draft', show_upcoming = ?, hero = 0, settings_json = json_set(settings_json, '$.heroEnabled', json('false')) WHERE id = ?",
      showUpcoming ? 1 : 0, r.id,
    );
    return json(await detail(ctx, (await loadCampaign(ctx, r.id))!));
  }
  const bad = await validatePublish(ctx, r.id, d);
  if (bad) return bad;
  const hero = (body.hero as boolean | undefined) ?? d.settings.heroEnabled;
  const settings = { ...d.settings, heroEnabled: hero };
  // Several campaigns may carry hero=1; which one shows is resolved per viewer date (heroFor).
  await ctx.db.run('UPDATE campaigns SET publish = ?, show_upcoming = ?, hero = ?, settings_json = ? WHERE id = ?', mode, showUpcoming ? 1 : 0, hero ? 1 : 0, JSON.stringify(settings), r.id);
  return json(await detail(ctx, (await loadCampaign(ctx, r.id))!));
};

export const cloneCampaign: Handler = async (req, ctx, p) => {
  const src = await loadForAdmin(ctx, p.id);
  if (src instanceof Response) return src;
  const body = (await readBody(req)) ?? {};
  const inc = { host: true, missions: true, checklist: true, materials: true, ...(body.include && typeof body.include === 'object' ? body.include : {}) } as Record<string, boolean>;
  const title = body.title !== undefined ? str(body.title) : [...`${src.title} (복제)`].slice(0, TITLE_MAX).join('');
  if ([...title].length > TITLE_MAX) return invalid('title', `캠페인 이름은 ${TITLE_MAX}자까지 쓸 수 있어요`);

  const d = draftOf(src);
  const settings = { ...d.settings, heroEnabled: false } as CampaignSettings & Record<string, unknown>;
  if (!inc.host) settings.hostLink = 'none';
  if (!inc.materials) {
    const def = defaultSettings(src.type);
    settings.slots = def.slots;
    settings.blockToolId = null;
  }
  const id = nanoid();
  const stmts: Array<[string, unknown[]]> = [];
  // Explainer (signature 설명 글) is authoring content, so it is copied with its attachments.
  const ex = src.type === 'signature' ? await ctx.db.first<{ title: string; body: string; author_id: string; attachments_json: string }>(
    'SELECT title, body, author_id, attachments_json FROM posts WHERE id = ?', (d.settings as SignatureSettings).explainerPostId ?? '') : null;
  if (ex) {
    const postId = nanoid();
    const atts = (JSON.parse(ex.attachments_json) as Array<{ id: string }>).map((a) => ({ ...a, from: a.id, id: nanoid() }));
    stmts.push(['INSERT INTO posts (id, created_at, board_type, board_id, category, title, body, author_id, attachments_json, sim_date) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [postId, ctx.now, 'campaign', id, 'explainer', ex.title, ex.body, ex.author_id, JSON.stringify(atts.map(({ from: _f, ...a }) => a)), ctx.simDate]]);
    for (const a of atts) {
      stmts.push(['INSERT INTO files (id, created_at, mime, bytes, data, owner_id, sim_date, post_id) SELECT ?, ?, mime, bytes, data, owner_id, ?, ? FROM files WHERE id = ?',
        [a.id, ctx.now, ctx.simDate, postId, a.from]]);
    }
    settings.explainerPostId = postId;
  } else if (src.type === 'signature') settings.explainerPostId = null;

  stmts.unshift([
    `INSERT INTO campaigns (id, created_at, type, title, summary, image_file_id, host_group_id, schedule_json, settings_json, publish, show_upcoming, hero, created_by, sim_date)
     VALUES (?,?,?,?,?,?,?,?,?,'draft',0,0,?,?)`,
    [id, ctx.now, src.type, title, src.summary, src.image_file_id, inc.host ? src.host_group_id : null, JSON.stringify(emptySchedule()), JSON.stringify(settings), ctx.userId, ctx.simDate],
  ]);
  if (inc.missions) {
    // The schedule is cleared, so absolute dates of dated missions are cleared too (admin re-sets them).
    const ms = await ctx.db.all<MissionRow & { cycle: string; settings_json: string }>('SELECT * FROM missions WHERE campaign_id = ?', src.id);
    for (const m of ms) {
      stmts.push(['INSERT INTO missions (id, created_at, campaign_id, title, description, cycle, fields_json, position, settings_json, round, date, category, sim_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [nanoid(), ctx.now, id, m.title, m.description, m.cycle, m.fields_json, m.position, m.settings_json, m.round, null, m.category, ctx.simDate]]);
    }
  }
  if (inc.checklist) {
    stmts.push(['INSERT INTO checklist_items (id, created_at, campaign_id, text, position, link_type, target, sim_date) SELECT lower(hex(randomblob(10))), ?, ?, text, position, link_type, target, ? FROM checklist_items WHERE campaign_id = ?',
      [ctx.now, id, ctx.simDate, src.id]]);
  }
  if (inc.materials) {
    stmts.push(['INSERT INTO campaign_files (id, created_at, campaign_id, file_id, name, exclusive, sim_date) SELECT lower(hex(randomblob(10))), created_at, ?, file_id, name, exclusive, ? FROM campaign_files WHERE campaign_id = ?',
      [id, ctx.simDate, src.id]]);
    stmts.push(['INSERT INTO campaign_tools (id, created_at, campaign_id, tool_id, slot, exclusive, sim_date) SELECT lower(hex(randomblob(10))), created_at, ?, tool_id, slot, exclusive, ? FROM campaign_tools WHERE campaign_id = ?',
      [id, ctx.simDate, src.id]]);
  }
  await ctx.db.batch(stmts);
  return json(await detail(ctx, (await loadCampaign(ctx, id))!), 201);
};

// ---- missions & bundles -----------------------------------------------------

function missionStmts(ctx: Ctx, campaignId: string, cycle: MissionCycle, list: Array<Omit<Mission, 'id'> & { id: string }>): Array<[string, unknown[]]> {
  return [
    ['DELETE FROM missions WHERE campaign_id = ?', [campaignId]],
    ...list.map((m, i): [string, unknown[]] => [
      'INSERT INTO missions (id, created_at, campaign_id, title, description, cycle, fields_json, position, round, date, category, sim_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [m.id, ctx.now, campaignId, m.title.trim(), (m.description ?? '').trim(), cycle, JSON.stringify(m.extraFields), i,
        cycle === 'dated' ? null : cycle === 'whole' ? 1 : m.round, cycle === 'dated' ? m.date : null, (m.category ?? '').trim(), ctx.simDate],
    ]),
  ];
}

const sortMissions = <T extends { round: number | null; date: string | null }>(list: T[]) =>
  [...list].sort((a, b) => (a.date && b.date ? (a.date < b.date ? -1 : 1) : (a.round ?? 0) - (b.round ?? 0)));

export const putMissions: Handler = async (req, ctx, p) => {
  const r = await loadForAdmin(ctx, p.id);
  if (r instanceof Response) return r;
  if (r.type !== 'practice') return invalid('type', '미션은 실천 캠페인에만 넣어요');
  const list = await readArray(req);
  if (!list) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const s = settingsOf(r) as PracticeSettings;
  const bad = fromV(validateMissions(s.missionCycle, list, scheduleOf(r)));
  if (bad) return bad;
  if (r.publish !== 'draft' && s.recordEnabled && list.length === 0) return invalid('missions', '공개한 캠페인에는 미션이 하나 이상 있어야 해요');
  const existing = new Set((await ctx.db.all<{ id: string }>('SELECT id FROM missions WHERE campaign_id = ?', r.id)).map((m) => m.id));
  const items = sortMissions((list as Array<Mission & { id?: string }>).map((m) => ({
    ...m, round: m.round ?? null, date: m.date ?? null, id: m.id && existing.has(m.id) ? m.id : nanoid(),
  })));
  await ctx.db.batch(missionStmts(ctx, r.id, s.missionCycle, items));
  return json({ missions: await missionsOf(ctx, r.id) });
};

interface BundleMission { round: number | null; dayOffset: number | null; category: string; title: string; description?: string; extraFields: RecordField[] }
interface BundleData { cycle: MissionCycle; recordCycle: PracticeSettings['recordCycle']; recordFields: RecordField[]; numberUnit?: string; numberGoal?: number; missions: BundleMission[] }

function bundleView(b: { id: string; title: string; owner_name: string; data_json: string; created_at: string }) {
  const d = JSON.parse(b.data_json) as BundleData;
  return {
    id: b.id, name: b.title, ownerName: b.owner_name, createdAt: b.created_at,
    cycle: d.cycle, recordCycle: d.recordCycle, recordFields: d.recordFields, numberUnit: d.numberUnit ?? null,
    missionCount: d.missions.length, categories: [...new Set(d.missions.map((m) => m.category).filter(Boolean))], missions: d.missions,
  };
}

export const listBundles: Handler = async (req, ctx) => {
  if (!isAdmin(ctx)) return adminOnly();
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase();
  const rows = await ctx.db.all<{ id: string; title: string; owner_name: string; data_json: string; created_at: string }>(
    'SELECT id, title, owner_name, data_json, created_at FROM mission_bundles ORDER BY created_at DESC, id DESC',
  );
  const items = rows.map(bundleView).filter((b) => !q || b.name.toLowerCase().includes(q) || b.categories.some((c) => c.toLowerCase().includes(q)));
  return json({ items, nextCursor: null });
};

export const createBundle: Handler = async (req, ctx) => {
  if (!isAdmin(ctx)) return adminOnly();
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const name = str(body.name);
  if (!name || [...name].length > 40) return invalid('name', '묶음 이름은 1~40자로 써 주세요');
  const r = typeof body.campaignId === 'string' ? await loadCampaign(ctx, body.campaignId) : null;
  if (!r) return notFound();
  if (r.type !== 'practice') return invalid('type', '미션은 실천 캠페인에만 있어요');
  const s = settingsOf(r) as PracticeSettings;
  const sched = scheduleOf(r);
  const missions = await missionsOf(ctx, r.id);
  if (missions.length === 0) return invalid('missions', '저장할 미션이 없어요');
  if (s.missionCycle === 'dated' && !sched.runStart) return invalid('schedule.runStart', '날짜 지정 미션은 진행 시작을 정한 뒤 저장할 수 있어요');
  const data: BundleData = {
    cycle: s.missionCycle, recordCycle: s.recordCycle, recordFields: s.recordFields,
    ...(s.numberUnit !== undefined ? { numberUnit: s.numberUnit } : {}), ...(s.numberGoal !== undefined ? { numberGoal: s.numberGoal } : {}),
    missions: missions.map((m) => ({
      round: s.missionCycle === 'dated' ? null : m.round, dayOffset: s.missionCycle === 'dated' && m.date ? diffDays(sched.runStart!, m.date) : null,
      category: m.category, title: m.title, ...(m.description ? { description: m.description } : {}), extraFields: m.extraFields,
    })),
  };
  const id = nanoid();
  const owner = (await hostOf(ctx, r)).name;
  await ctx.db.run('INSERT INTO mission_bundles (id, created_at, campaign_id, title, data_json, owner_name, created_by, sim_date) VALUES (?,?,?,?,?,?,?,?)',
    id, ctx.now, r.id, name, JSON.stringify(data), owner, ctx.userId, ctx.simDate);
  return json(bundleView({ id, title: name, owner_name: owner, data_json: JSON.stringify(data), created_at: ctx.now }), 201);
};

/** Recomputes bundle rounds/dates for this campaign's run (weekly/daily: drop rounds past the run; dated: shift by runStart). */
export const importBundle: Handler = async (_req, ctx, p) => {
  const r = await loadForAdmin(ctx, p.id);
  if (r instanceof Response) return r;
  if (r.type !== 'practice') return invalid('type', '미션은 실천 캠페인에만 넣어요');
  const b = await ctx.db.first<{ data_json: string }>('SELECT data_json FROM mission_bundles WHERE id = ?', p.bundleId);
  if (!b) return fail(404, 'BUNDLE_NOT_FOUND', '미션 묶음을 찾을 수 없어요');
  const data = JSON.parse(b.data_json) as BundleData;
  const sched = scheduleOf(r);
  const runDays = sched.runDays;
  if (data.cycle === 'dated' && !sched.runStart) return invalid('schedule.runStart', '날짜 지정 묶음은 진행 시작을 정한 뒤 불러올 수 있어요');
  const maxRound = runDays ? (data.cycle === 'weekly' ? Math.ceil(runDays / 7) : data.cycle === 'daily' ? runDays : 1) : Infinity;
  const items = data.missions
    .map((m) => ({
      id: nanoid(), category: m.category, title: m.title, description: m.description, extraFields: m.extraFields,
      round: data.cycle === 'dated' ? null : data.cycle === 'whole' ? 1 : m.round,
      date: data.cycle === 'dated' && m.dayOffset !== null ? addDays(sched.runStart!, m.dayOffset) : null,
      offset: m.dayOffset,
    }))
    .filter((m) => (data.cycle === 'dated' ? m.offset !== null && m.offset >= 0 && (!runDays || m.offset < runDays) : (m.round ?? 1) <= maxRound))
    .slice(0, data.cycle === 'whole' ? 1 : undefined)
    .map(({ offset: _o, ...m }) => m);
  const s = settingsOf(r) as PracticeSettings & Record<string, unknown>;
  if (items.length === 0 && r.publish !== 'draft' && s.recordEnabled) return invalid('missions', '이 일정에 들어갈 미션이 묶음에 없어요');
  const settings: Record<string, unknown> = { ...s, missionCycle: data.cycle, recordCycle: data.recordCycle, recordFields: data.recordFields };
  delete settings.numberUnit;
  delete settings.numberGoal;
  if (data.numberUnit !== undefined) settings.numberUnit = data.numberUnit;
  if (data.numberGoal !== undefined) settings.numberGoal = data.numberGoal;
  await ctx.db.batch([
    ['UPDATE campaigns SET settings_json = ? WHERE id = ?', [JSON.stringify(cleanSettings('practice', settings)), r.id]],
    ...missionStmts(ctx, r.id, data.cycle, sortMissions(items)),
  ]);
  return json({ missions: await missionsOf(ctx, r.id), settings: settingsOf((await loadCampaign(ctx, r.id))!) });
};

// ---- checklist, files, tools, explainer -------------------------------------

const LINK_TYPES = ['post', 'tool', 'url'] as const;

export const putChecklist: Handler = async (req, ctx, p) => {
  const r = await loadForAdmin(ctx, p.id);
  if (r instanceof Response) return r;
  const list = await readArray(req);
  if (!list) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  if (list.length > 10) return invalid('checklist', '추가 항목은 10개까지 넣을 수 있어요');
  const rows: Array<{ label: string; linkType: string; target: string }> = [];
  for (const [i, raw] of list.entries()) {
    const it = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const f = `checklist[${i}]`;
    const label = str(it.label);
    if (!label || [...label].length > 30) return invalid(`${f}.label`, '항목 이름은 1~30자로 써 주세요');
    if (!LINK_TYPES.includes(it.linkType as never)) return invalid(`${f}.linkType`, '연결할 곳을 골라 주세요');
    const target = str(it.target);
    if (it.linkType === 'url') {
      let ok = false;
      try { ok = ['http:', 'https:'].includes(new URL(target).protocol); } catch { ok = false; }
      if (!ok || target.length > 500) return invalid(`${f}.target`, '링크 주소가 올바르지 않아요');
    } else if (it.linkType === 'post') {
      if (!target || !(await ctx.db.first('SELECT id FROM posts WHERE id = ?', target))) return invalid(`${f}.target`, '게시판 글을 찾을 수 없어요');
    } else if (!target || !(await toolExists(ctx, target))) return invalid(`${f}.target`, '도구를 찾을 수 없어요');
    rows.push({ label, linkType: it.linkType as string, target });
  }
  await ctx.db.batch([
    ['DELETE FROM checklist_items WHERE campaign_id = ?', [r.id]],
    ...rows.map((c, i): [string, unknown[]] => [
      'INSERT INTO checklist_items (id, created_at, campaign_id, text, position, link_type, target, sim_date) VALUES (?,?,?,?,?,?,?,?)',
      [nanoid(), ctx.now, r.id, c.label, i, c.linkType, c.target, ctx.simDate],
    ]),
  ]);
  const missions = await missionsOf(ctx, r.id);
  const materials = (await filesOf(ctx, r.id)).length + (await toolsOf(ctx, r.id)).length;
  return json({ checklist: await checklistOf(ctx, r, settingsOf(r), missions.length, materials) });
};

export const addCampaignFile: Handler = async (req, ctx, p) => {
  const r = await loadForAdmin(ctx, p.id);
  if (r instanceof Response) return r;
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const data = typeof body.dataBase64 === 'string' ? decodeBase64(body.dataBase64) : null;
  if (!data || data.byteLength === 0) return fail(400, 'BAD_ATTACHMENT', '파일을 읽을 수 없어요');
  if (!checkFileSize(data.byteLength)) return fail(413, 'FILE_TOO_LARGE', '파일은 1MB 이하만 올릴 수 있어요');
  const name = str(body.name).slice(0, 100) || 'file';
  const mime = str(body.mime).slice(0, 100) || 'application/octet-stream';
  const exclusive = body.exclusive === true;
  const fileId = nanoid();
  await ctx.db.batch([
    ['INSERT INTO files (id, created_at, mime, bytes, data, owner_id, sim_date) VALUES (?,?,?,?,?,?,?)',
      [fileId, ctx.now, mime, data.byteLength, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), ctx.userId, ctx.simDate]],
    ['INSERT INTO campaign_files (id, created_at, campaign_id, file_id, name, exclusive, sim_date) VALUES (?,?,?,?,?,?,?)',
      [nanoid(), ctx.now, r.id, fileId, name, exclusive ? 1 : 0, ctx.simDate]],
  ]);
  return json({ id: fileId, name, mime, bytes: data.byteLength, exclusive }, 201);
};

export const patchCampaignFile: Handler = async (req, ctx, p) => {
  const r = await loadForAdmin(ctx, p.id);
  if (r instanceof Response) return r;
  const body = await readBody(req);
  if (!body || typeof body.exclusive !== 'boolean') return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const res = await ctx.db.run('UPDATE campaign_files SET exclusive = ? WHERE campaign_id = ? AND file_id = ?', body.exclusive ? 1 : 0, r.id, p.fileId);
  if (!res.changes) return fail(404, 'FILE_NOT_FOUND', '파일을 찾을 수 없어요');
  return json({ ok: true, exclusive: body.exclusive });
};

export const deleteCampaignFile: Handler = async (_req, ctx, p) => {
  const r = await loadForAdmin(ctx, p.id);
  if (r instanceof Response) return r;
  const res = await ctx.db.run('DELETE FROM campaign_files WHERE campaign_id = ? AND file_id = ?', r.id, p.fileId);
  if (!res.changes) return fail(404, 'FILE_NOT_FOUND', '파일을 찾을 수 없어요');
  // Clones share file rows; drop the blob only when no campaign links it any more.
  await ctx.db.run('DELETE FROM files WHERE id = ? AND post_id IS NULL AND NOT EXISTS (SELECT 1 FROM campaign_files WHERE file_id = ?)', p.fileId, p.fileId);
  return json({ ok: true });
};

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** 대표 이미지 바꾸기: { mime, dataBase64 }. The old blob is dropped when no other campaign (clones) uses it. */
export const putCampaignImage: Handler = async (req, ctx, p) => {
  const r = await loadForAdmin(ctx, p.id);
  if (r instanceof Response) return r;
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const mime = str(body.mime);
  if (!IMAGE_MIMES.includes(mime)) return invalid('imageFileId', '이미지 파일만 올릴 수 있어요');
  const data = typeof body.dataBase64 === 'string' ? decodeBase64(body.dataBase64) : null;
  if (!data || data.byteLength === 0) return fail(400, 'BAD_ATTACHMENT', '이미지를 읽을 수 없어요');
  if (!checkFileSize(data.byteLength)) return fail(413, 'FILE_TOO_LARGE', '파일은 1MB 이하만 올릴 수 있어요');
  const fileId = nanoid();
  const old = r.image_file_id;
  const stmts: Array<[string, unknown[]]> = [
    ['INSERT INTO files (id, created_at, mime, bytes, data, owner_id, sim_date) VALUES (?,?,?,?,?,?,?)',
      [fileId, ctx.now, mime, data.byteLength, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), ctx.userId, ctx.simDate]],
    ['UPDATE campaigns SET image_file_id = ? WHERE id = ?', [fileId, r.id]],
  ];
  if (old) {
    stmts.push(['DELETE FROM files WHERE id = ? AND post_id IS NULL AND record_id IS NULL AND NOT EXISTS (SELECT 1 FROM campaigns WHERE image_file_id = ?) AND NOT EXISTS (SELECT 1 FROM campaign_files WHERE file_id = ?)',
      [old, old, old]]);
  }
  await ctx.db.batch(stmts);
  return json(await detail(ctx, (await loadCampaign(ctx, r.id))!));
};

export const putCampaignTools: Handler = async (req, ctx, p) => {
  const r = await loadForAdmin(ctx, p.id);
  if (r instanceof Response) return r;
  const list = await readArray(req);
  if (!list) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  if (list.length > 20) return invalid('tools', '웹 도구는 20개까지 연결할 수 있어요');
  const seen = new Set<string>();
  for (const [i, raw] of list.entries()) {
    const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    if (typeof t.toolId !== 'string' || seen.has(t.toolId) || !(await toolExists(ctx, t.toolId))) return invalid(`tools[${i}].toolId`, '웹 도구를 찾을 수 없어요');
    if (t.exclusive !== undefined && typeof t.exclusive !== 'boolean') return invalid(`tools[${i}].exclusive`, '캠페인 전용 값이 올바르지 않아요');
    seen.add(t.toolId);
  }
  await ctx.db.batch([
    ['DELETE FROM campaign_tools WHERE campaign_id = ?', [r.id]],
    ...(list as Array<{ toolId: string; exclusive?: boolean }>).map((t): [string, unknown[]] => [
      'INSERT INTO campaign_tools (id, created_at, campaign_id, tool_id, exclusive, sim_date) VALUES (?,?,?,?,?,?)',
      [nanoid(), ctx.now, r.id, t.toolId, t.exclusive ? 1 : 0, ctx.simDate],
    ]),
  ]);
  return json({ tools: await toolsOf(ctx, r.id) });
};

/** 서명 설명 글: a post on the campaign board with category 'explainer'. attachments: [{id}] keeps, [{name,mime,dataBase64}] adds. */
export const putExplainer: Handler = async (req, ctx, p) => {
  const r = await loadForAdmin(ctx, p.id);
  if (r instanceof Response) return r;
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  if (r.type !== 'signature') return invalid('type', '설명 글은 서명 캠페인에만 써요');
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const title = str(body.title);
  const text = typeof body.body === 'string' ? body.body : '';
  if (!title || [...title].length > 100) return invalid('explainer.title', '제목은 1~100자로 써 주세요');
  if (!text.trim() || text.length > 10000) return invalid('explainer.body', '내용은 1~10000자로 써 주세요');
  const raw = Array.isArray(body.attachments) ? (body.attachments as Array<Record<string, unknown>>) : [];
  if (raw.length > 5) return fail(400, 'TOO_MANY_FILES', '첨부는 5개까지 올릴 수 있어요');

  const settings = settingsOf(r) as SignatureSettings;
  const existing = settings.explainerPostId
    ? await ctx.db.first<{ id: string; attachments_json: string }>('SELECT id, attachments_json FROM posts WHERE id = ?', settings.explainerPostId)
    : null;
  const postId = existing?.id ?? nanoid();
  const prev = existing ? (JSON.parse(existing.attachments_json) as Array<{ id: string; name: string; mime: string; bytes: number }>) : [];
  const meta: Array<{ id: string; name: string; mime: string; bytes: number }> = [];
  const stmts: Array<[string, unknown[]]> = [];
  for (const a of raw) {
    if (typeof a?.id === 'string' && !a.dataBase64) {
      const keep = prev.find((x) => x.id === a.id);
      if (!keep) return fail(400, 'BAD_ATTACHMENT', '첨부 파일을 찾을 수 없어요');
      meta.push(keep);
      continue;
    }
    const data = typeof a?.dataBase64 === 'string' ? decodeBase64(a.dataBase64) : null;
    if (!data) return fail(400, 'BAD_ATTACHMENT', '첨부 파일을 읽을 수 없어요');
    if (!checkFileSize(data.byteLength)) return fail(413, 'FILE_TOO_LARGE', '파일은 1MB 이하만 올릴 수 있어요');
    const f = { id: nanoid(), name: str(a.name).slice(0, 100) || 'file', mime: str(a.mime) || 'application/octet-stream', bytes: data.byteLength };
    meta.push(f);
    stmts.push(['INSERT INTO files (id, created_at, mime, bytes, data, owner_id, sim_date, post_id) VALUES (?,?,?,?,?,?,?,?)',
      [f.id, ctx.now, f.mime, f.bytes, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), uid, ctx.simDate, postId]]);
  }
  for (const old of prev) if (!meta.some((m) => m.id === old.id)) stmts.push(['DELETE FROM files WHERE id = ? AND post_id = ?', [old.id, postId]]);
  if (existing) {
    stmts.push(['UPDATE posts SET title = ?, body = ?, attachments_json = ? WHERE id = ?', [title, text, JSON.stringify(meta), postId]]);
  } else {
    stmts.push(['INSERT INTO posts (id, created_at, board_type, board_id, category, title, body, author_id, attachments_json, sim_date) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [postId, ctx.now, 'campaign', r.id, 'explainer', title, text, uid, JSON.stringify(meta), ctx.simDate]]);
    stmts.push(['UPDATE campaigns SET settings_json = ? WHERE id = ?', [JSON.stringify({ ...settings, explainerPostId: postId }), r.id]]);
  }
  await ctx.db.batch(stmts);
  return json({ explainer: await explainerOf(ctx, { ...settings, explainerPostId: postId }) });
};

// ---- public reads -----------------------------------------------------------

const STATUS_RANK: Record<CampaignStatus, number> = { recruiting: 0, running: 1, scheduled: 2, closed: 3, draft: 4 };

function deadlineOf(r: CampaignRow, st: CampaignStatus): string {
  const s = statusInput(r);
  if (st === 'running') return runEnd(s) ?? '9999-12-31';
  return s.schedule.recruitEnd ?? '9999-12-31';
}

export const listCampaigns: Handler = async (req, ctx) => {
  const sp = new URL(req.url).searchParams;
  const rows = await ctx.db.all<CampaignRow>(
    `SELECT * FROM campaigns ${isAdmin(ctx) ? '' : "WHERE publish <> 'draft'"} ORDER BY created_at DESC, id DESC`,
  );
  const hostIds = [...new Set(rows.map((r) => r.host_group_id).filter((x): x is string => !!x))];
  const groups = hostIds.length
    ? await ctx.db.all<{ id: string; name: string; sido: string }>(`SELECT id, name, sido FROM groups WHERE id IN (${hostIds.map(() => '?').join(',')})`, ...hostIds)
    : [];
  const gmap = new Map(groups.map((g) => [g.id, g]));
  const type = sp.get('type'), mode = sp.get('mode'), region = sp.get('region'), status = sp.get('status');
  const q = (sp.get('q') ?? '').trim().toLowerCase();
  const hero = sp.get('hero') === '1';
  const hostGroupId = sp.get('hostGroupId');

  const base = rows
    .map((r) => ({ r, st: statusOf(ctx, r), settings: settingsOf(r), g: r.host_group_id ? gmap.get(r.host_group_id) : undefined }))
    .filter(({ r, st }) => visibleTo(ctx, r, st))
    .filter(({ r }) => !hostGroupId || r.host_group_id === hostGroupId)
    .filter(({ r }) => !type || r.type === type)
    .filter(({ settings }) => !mode || settings.mode === mode)
    .filter(({ g }) => !region || (g?.sido || '전국·온라인') === region)
    .filter(({ r, g }) => !q || r.title.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q) || (g?.name ?? IGT_NAME).toLowerCase().includes(q))
    .filter(({ r, st }) => !hero || heroQualifies(ctx, r, st));
  const counts = { all: base.length, scheduled: 0, recruiting: 0, running: 0, closed: 0, draft: 0 };
  for (const b of base) counts[b.st]++;
  let list = status ? base.filter((b) => b.st === status) : base;
  if (hero) list = list.sort((a, b) => heroKey(b.r).localeCompare(heroKey(a.r))).slice(0, 1);
  if (sp.get('sort') === 'deadline') {
    list = [...list].sort((a, b) => STATUS_RANK[a.st] - STATUS_RANK[b.st] || deadlineOf(a.r, a.st).localeCompare(deadlineOf(b.r, b.st)));
  }
  const offset = parseCursor(req);
  const slice = list.slice(offset, offset + PAGE_SIZE + 1);
  const ids = slice.map((b) => b.r.id);
  const pc = ids.length
    ? await ctx.db.all<{ campaign_id: string; n: number }>(
      `SELECT campaign_id, COUNT(*) n FROM participations WHERE campaign_id IN (${ids.map(() => '?').join(',')}) AND ${ACTIVE} GROUP BY campaign_id`, ...ids)
    : [];
  const pmap = new Map(pc.map((x) => [x.campaign_id, x.n]));
  const sc = ids.length
    ? await ctx.db.all<{ campaign_id: string; n: number }>(
      `SELECT campaign_id, COUNT(*) n FROM campaign_subscriptions WHERE campaign_id IN (${ids.map(() => '?').join(',')}) GROUP BY campaign_id`, ...ids)
    : [];
  const smap = new Map(sc.map((x) => [x.campaign_id, x.n]));
  const items = slice.map(({ r, st, settings, g }) => ({
    id: r.id, type: r.type, title: r.title, summary: r.summary, imageFileId: r.image_file_id,
    host: g ? { type: 'group' as const, id: g.id, name: g.name } : { type: 'igt' as const, name: IGT_NAME },
    mode: settings.mode, schedule: scheduleOf(r), status: st, participantCount: pmap.get(r.id) ?? 0, subscriberCount: smap.get(r.id) ?? 0, hero: !!r.hero,
    ...(isAdmin(ctx) ? { publish: r.publish, showUpcoming: !!r.show_upcoming } : {}),
  }));
  return json({ ...page(items, offset), counts });
};

// ---- home hero --------------------------------------------------------------

const heroKey = (r: CampaignRow) => {
  const s = scheduleOf(r);
  return `${s.recruitStart ?? ''}T${s.recruitStartTime ?? '00:00'}|${r.created_at}`;
};

/** hero=1, visible, not draft/closed, and recruiting has started by the viewer's date + time. */
function heroQualifies(ctx: Ctx, r: CampaignRow, st: CampaignStatus): boolean {
  if (!r.hero || st === 'draft' || st === 'closed' || !visibleTo(ctx, r, st)) return false;
  const s = scheduleOf(r);
  if (!s.recruitStart) return false;
  return `${s.recruitStart}T${s.recruitStartTime ?? '00:00'}` <= `${ctx.simDate}T${ctx.simTime}`;
}

/** Home hero for this viewer: the qualifying hero campaign with the latest recruit start (or null). */
export const getHero: Handler = async (_req, ctx) => {
  const rows = await ctx.db.all<CampaignRow>("SELECT * FROM campaigns WHERE hero = 1 AND publish <> 'draft'");
  const best = rows.filter((r) => heroQualifies(ctx, r, statusOf(ctx, r))).sort((a, b) => heroKey(b).localeCompare(heroKey(a)))[0];
  return json({ campaign: best ? await detail(ctx, best) : null });
};

export const getCampaign: Handler = async (_req, ctx, p) => {
  const r = await loadCampaign(ctx, p.id);
  if (!r || !visibleTo(ctx, r)) return notFound();
  return json(await detail(ctx, r));
};

/** Explainer posts are public wherever the campaign is visible (used by getFile). */
export async function explainerVisible(ctx: Ctx, campaignId: string): Promise<boolean> {
  const r = await loadCampaign(ctx, campaignId);
  return !!r && visibleTo(ctx, r);
}

// ---- 알림 받기 (모집 예정 구독) ----------------------------------------------

/** POST /api/campaigns/:id/subscribe — idempotent. */
export const subscribeCampaign: Handler = async (_req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const r = await loadCampaign(ctx, p.id);
  if (!r || !visibleTo(ctx, r)) return notFound();
  await ctx.db.run(
    'INSERT OR IGNORE INTO campaign_subscriptions (id, created_at, campaign_id, user_id, sim_date) VALUES (?,?,?,?,?)',
    nanoid(), ctx.now, r.id, uid, ctx.simDate,
  );
  const n = (await ctx.db.first<{ n: number }>('SELECT COUNT(*) n FROM campaign_subscriptions WHERE campaign_id = ?', r.id))!.n;
  return json({ subscribed: true, subscriberCount: n });
};

/** DELETE /api/campaigns/:id/subscribe */
export const unsubscribeCampaign: Handler = async (_req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const r = await loadCampaign(ctx, p.id);
  if (!r) return notFound();
  await ctx.db.run('DELETE FROM campaign_subscriptions WHERE campaign_id = ? AND user_id = ?', r.id, uid);
  const n = (await ctx.db.first<{ n: number }>('SELECT COUNT(*) n FROM campaign_subscriptions WHERE campaign_id = ?', r.id))!.n;
  return json({ subscribed: false, subscriberCount: n });
};
