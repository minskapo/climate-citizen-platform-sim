import { nanoid } from 'nanoid';
import { addDays, diffDays, koShort } from '@shared/date';
import { backfillableSlots, missedStreak, missionForDate, nextSlot, progress, recordSlots } from '@shared/missions';
import type { RecordField } from '@shared/types';
import { checkFileSize } from '@shared/validate';
import { isISODate, type PracticeSettings } from '../campaignSettings';
import { fail, json, type Ctx, type Handler } from '../db';
import { missionsOf, scheduleOf, settingsOf, visibleTo, type CampaignRow } from './campaigns';
import { isStaffRole, memberRole } from './groups';
import { decodeBase64 } from './posts';
import { loadCampaignRow, loadOwn, type ParticipationRow } from './participations';
import { readBody, requireUser, str } from './common';

const CHECKS = ['done', 'partial', 'none'] as const;
type Check = (typeof CHECKS)[number];
const CHECK_LABEL: Record<Check, string> = { done: '했어요', partial: '조금 했어요', none: '못 했어요' };
const MEMO_MAX = 100;

interface RecordRow { id: string; participation_id: string; mission_id: string | null; slot_date: string; fields_json: string; sim_date: string | null; created_at: string }
interface RecordFields { check: Check; memo?: string; photoFileId?: string; number?: number; postId?: string }

const recordView = (r: RecordRow) => {
  const f = JSON.parse(r.fields_json) as RecordFields;
  return {
    id: r.id, slotDate: r.slot_date, missionId: r.mission_id, check: f.check, memo: f.memo ?? null, photoFileId: f.photoFileId ?? null,
    number: f.number ?? null, postId: f.postId ?? null, simDate: r.sim_date, createdAt: r.created_at,
  };
};

function runOf(c: CampaignRow): { runStart: string; runDays: number } | null {
  const s = scheduleOf(c);
  return s.runStart && s.runDays ? { runStart: s.runStart, runDays: s.runDays } : null;
}

const pausedDates = (p: ParticipationRow): string[] => {
  if (!p.paused_from || !p.paused_until) return [];
  const n = diffDays(p.paused_from, p.paused_until);
  return Array.from({ length: n + 1 }, (_, i) => addDays(p.paused_from!, i));
};

async function recordsOf(ctx: Ctx, participationId: string): Promise<RecordRow[]> {
  return ctx.db.all<RecordRow>('SELECT * FROM records WHERE participation_id = ? ORDER BY slot_date', participationId);
}

export const putRecord: Handler = async (req, ctx, params) => {
  const o = await loadOwn(ctx, params.id);
  if (o instanceof Response) return o;
  const { p, c, uid } = o;
  if (c.type !== 'practice') return fail(400, 'NOT_PRACTICE', '실천 캠페인에서만 기록할 수 있어요');
  const settings = settingsOf(c) as PracticeSettings;
  if (!settings.recordEnabled) return fail(409, 'RECORD_DISABLED', '기록을 받지 않는 캠페인이에요');
  if (p.state !== 'applied') return fail(409, 'NOT_ACTIVE', '참여 중일 때만 기록할 수 있어요');
  const slot = params.slotDate;
  const run = runOf(c);
  if (!isISODate(slot) || !run) return fail(400, 'NOT_A_SLOT', '기록할 차례가 아니에요');
  const slots = recordSlots(settings.recordCycle, run.runStart, run.runDays);
  if (!slots.includes(slot)) return fail(400, 'NOT_A_SLOT', '기록할 차례가 아니에요');
  if (slot > ctx.simDate) return fail(400, 'TOO_EARLY', '아직 기록할 날이 아니에요');
  const existing = await recordsOf(ctx, p.id);
  if (slot < ctx.simDate) {
    const can = backfillableSlots(slots, existing.map((r) => r.slot_date), ctx.simDate);
    if (!can.includes(slot)) return fail(400, 'TOO_LATE', '지난 기록은 2차례 전까지만 채울 수 있어요');
  }

  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  if (!CHECKS.includes(body.check as Check)) return fail(400, 'BAD_CHECK', '실천 체크를 골라 주세요');
  const mission = missionForDate(await missionsOf(ctx, c.id), settings.missionCycle, run.runStart, slot, run.runDays);
  const enabled = new Set<RecordField>([...settings.recordFields, ...(mission?.extraFields ?? [])]);
  const want = (k: RecordField, present: boolean) => present && !enabled.has(k);
  if (want('memo', body.memo !== undefined && body.memo !== null && body.memo !== '')
    || want('photo', body.photo !== undefined && body.photo !== null)
    || want('number', body.number !== undefined && body.number !== null)) {
    return fail(400, 'FIELD_NOT_ENABLED', '이 캠페인에서 받지 않는 기록 항목이에요');
  }
  const prev = existing.find((r) => r.slot_date === slot);
  const prevFields = prev ? (JSON.parse(prev.fields_json) as RecordFields) : null;
  const fields: RecordFields = { check: body.check as Check };
  if (prevFields?.postId) fields.postId = prevFields.postId;
  const memo = str(body.memo);
  if ([...memo].length > MEMO_MAX) return fail(400, 'BAD_MEMO', `메모는 ${MEMO_MAX}자까지 쓸 수 있어요`);
  if (memo) fields.memo = memo;
  if (body.number !== undefined && body.number !== null) {
    if (typeof body.number !== 'number' || !Number.isFinite(body.number) || Math.abs(body.number) > 1e9) return fail(400, 'BAD_NUMBER', '숫자를 바르게 적어 주세요');
    fields.number = body.number;
  }
  const recordId = prev?.id ?? nanoid();
  const stmts: Array<[string, unknown[]]> = [];
  let photo: Uint8Array | null = null;
  if (typeof body.photo === 'string' && body.photo) {
    photo = decodeBase64(body.photo);
    if (!photo) return fail(400, 'BAD_PHOTO', '사진을 읽을 수 없어요');
    if (!checkFileSize(photo.byteLength)) return fail(413, 'FILE_TOO_LARGE', '사진은 1MB 이하만 올릴 수 있어요');
    const fileId = nanoid();
    fields.photoFileId = fileId;
    stmts.push([
      'INSERT INTO files (id, created_at, mime, bytes, data, owner_id, sim_date, record_id) VALUES (?,?,?,?,?,?,?,?)',
      [fileId, ctx.now, 'image/jpeg', photo.byteLength, photo.buffer.slice(photo.byteOffset, photo.byteOffset + photo.byteLength), uid, ctx.simDate, recordId],
    ]);
  } else if (body.photo === undefined && prevFields?.photoFileId) {
    fields.photoFileId = prevFields.photoFileId; // keep the existing photo unless replaced/cleared
  }
  if (prevFields?.photoFileId && prevFields.photoFileId !== fields.photoFileId) {
    stmts.push(['DELETE FROM files WHERE id = ? AND post_id IS NULL', [prevFields.photoFileId]]);
  }

  let postId: string | null = null;
  if (body.alsoPost === true && !fields.postId) {
    postId = nanoid();
    fields.postId = postId;
  }
  stmts.push([
    `INSERT INTO records (id, created_at, participation_id, mission_id, slot_date, fields_json, sim_date) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT (participation_id, slot_date) DO UPDATE SET mission_id = excluded.mission_id, fields_json = excluded.fields_json, sim_date = excluded.sim_date`,
    [recordId, ctx.now, p.id, mission?.id ?? null, slot, JSON.stringify(fields), ctx.simDate],
  ]);
  if (postId) {
    const title = mission ? `${koShort(slot)} ${mission.title}` : `${koShort(slot)} 실천 기록`;
    const parts = [CHECK_LABEL[fields.check], fields.number !== undefined ? `${fields.number}${settings.numberUnit ?? ''}` : '', fields.memo ?? ''].filter(Boolean);
    const attachments = fields.photoFileId ? [{ id: fields.photoFileId, name: 'photo.jpg', mime: 'image/jpeg', bytes: photo?.byteLength ?? 0 }] : [];
    stmts.push([
      "INSERT INTO posts (id, created_at, board_type, board_id, category, title, body, author_id, attachments_json, sim_date) VALUES (?,?,'campaign',?,'인증',?,?,?,?,?)",
      [postId, ctx.now, c.id, title.slice(0, 100), parts.join(' · '), uid, JSON.stringify(attachments), ctx.simDate],
    ]);
    if (fields.photoFileId) stmts.push(['UPDATE files SET post_id = ? WHERE id = ?', [postId, fields.photoFileId]]);
  }
  await ctx.db.batch(stmts);
  const row = (await ctx.db.first<RecordRow>('SELECT * FROM records WHERE participation_id = ? AND slot_date = ?', p.id, slot))!;
  return json({ record: recordView(row) });
};

/** 기록 달력 · 나의 진행: own participation, host-group staff, or admin. */
export const listRecords: Handler = async (_req, ctx, params) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const p = await ctx.db.first<ParticipationRow>('SELECT * FROM participations WHERE id = ?', params.id);
  const c = p ? await loadCampaignRow(ctx, p.campaign_id) : null;
  if (!p || !c) return fail(404, 'PARTICIPATION_NOT_FOUND', '참여 정보를 찾을 수 없어요');
  if (p.user_id !== uid && ctx.role !== 'admin' && !(c.host_group_id && isStaffRole(ctx, c.host_group_id, await memberRole(ctx, c.host_group_id, uid)))) {
    return fail(404, 'PARTICIPATION_NOT_FOUND', '참여 정보를 찾을 수 없어요');
  }
  const rows = await recordsOf(ctx, p.id);
  const run = runOf(c);
  const settings = settingsOf(c) as PracticeSettings;
  const slots = c.type === 'practice' && run ? recordSlots(settings.recordCycle, run.runStart, run.runDays) : [];
  const dates = rows.map((r) => r.slot_date);
  const paused = pausedDates(p);
  return json({
    records: rows.map(recordView),
    slots,
    pausedDates: paused,
    backfillable: backfillableSlots(slots, dates, ctx.simDate),
    nextSlot: nextSlot(slots, ctx.simDate),
    isSlotToday: slots.includes(ctx.simDate),
    progress: progress(slots, dates, ctx.simDate),
    missedStreak: missedStreak(slots, dates, paused, ctx.simDate),
  });
};

/** 「오늘 n명 기록」: records for that slot date across the campaign. */
export const todayCount: Handler = async (req, ctx, params) => {
  const c = await loadCampaignRow(ctx, params.id);
  if (!c || !visibleTo(ctx, c)) return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
  const q = new URL(req.url).searchParams.get('date');
  const date = q ?? ctx.simDate;
  if (!isISODate(date)) return fail(400, 'BAD_DATE', '날짜 형식이 올바르지 않아요');
  const r = await ctx.db.first<{ n: number }>(
    'SELECT COUNT(*) n FROM records r JOIN participations p ON p.id = r.participation_id WHERE p.campaign_id = ? AND r.slot_date = ?', c.id, date);
  return json({ date, count: r?.n ?? 0 });
};

/** Record photo gating for getFile: owner, host-group staff, admin. */
export async function canSeeRecordFile(ctx: Ctx, recordId: string): Promise<boolean> {
  if (ctx.role === 'admin') return true;
  const r = await ctx.db.first<{ user_id: string; host_group_id: string | null }>(
    'SELECT p.user_id, c.host_group_id FROM records r JOIN participations p ON p.id = r.participation_id JOIN campaigns c ON c.id = p.campaign_id WHERE r.id = ?', recordId);
  if (!r) return false;
  if (r.user_id === ctx.userId) return true;
  return !!r.host_group_id && isStaffRole(ctx, r.host_group_id, await memberRole(ctx, r.host_group_id, ctx.userId));
}
