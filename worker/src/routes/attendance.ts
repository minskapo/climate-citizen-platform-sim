import { nanoid } from 'nanoid';
import { hmacHex, safeEqual } from '../auth';
import type { OfflineSettings } from '../campaignSettings';
import { fail, json, type Ctx, type Handler } from '../db';
import { scheduleOf, settingsOf, type CampaignRow } from './campaigns';
import { isStaffRole, memberRole } from './groups';
import { loadCampaignRow, type ParticipationRow } from './participations';
import { readBody, requireUser, str } from './common';

const MINUTE_MS = 60_000;
const WINDOW_MIN = 60;

/** 6-digit code from HMAC(secret, campaignId:minuteBucket). */
export async function attendanceCode(secret: string, campaignId: string, bucket: number): Promise<string> {
  const hex = await hmacHex(secret, `${campaignId}:${bucket}`);
  return String(parseInt(hex.slice(0, 8), 16) % 1_000_000).padStart(6, '0');
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** 모임 시작 1시간 전 ~ 끝난 뒤 1시간, on the event date — by the caller's date + time. */
export function attendanceOpen(ctx: Ctx, c: CampaignRow): boolean {
  const s = scheduleOf(c);
  if (!s.eventDate || !s.eventStart || !s.eventEnd || ctx.simDate !== s.eventDate) return false;
  const now = minutes(ctx.simTime);
  return now >= minutes(s.eventStart) - WINDOW_MIN && now <= minutes(s.eventEnd) + WINDOW_MIN;
}

async function isCampaignStaff(ctx: Ctx, c: CampaignRow): Promise<boolean> {
  if (ctx.role === 'admin') return true;
  return !!c.host_group_id && isStaffRole(ctx, c.host_group_id, await memberRole(ctx, c.host_group_id, ctx.userId));
}

const bucketNow = (ctx: Ctx) => Math.floor(Date.parse(ctx.now) / MINUTE_MS);

async function loadOffline(ctx: Ctx, id: string): Promise<CampaignRow | Response> {
  const c = await loadCampaignRow(ctx, id);
  if (!c || c.publish === 'draft') return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
  if (c.type !== 'offline') return fail(400, 'NOT_OFFLINE', '오프라인 모임에서만 출석을 받아요');
  return c;
}

/** 「출석 QR 띄우기」: admin / host-group staff. Code changes every minute. */
export const getAttendanceCode: Handler = async (_req, ctx, params) => {
  const c = await loadOffline(ctx, params.id);
  if (c instanceof Response) return c;
  if (!(await isCampaignStaff(ctx, c))) return fail(403, 'NOT_STAFF', '관리자 · 운영진만 볼 수 있어요');
  const bucket = bucketNow(ctx);
  return json({
    code: await attendanceCode(ctx.secret, c.id, bucket),
    validUntil: new Date((bucket + 2) * MINUTE_MS).toISOString(), // the previous minute's code is also accepted
    open: attendanceOpen(ctx, c),
    mode: (settingsOf(c) as OfflineSettings).attendance,
  });
};

async function recordAttendance(ctx: Ctx, p: ParticipationRow, method: 'qr' | 'manual') {
  await ctx.db.run(
    'INSERT OR IGNORE INTO attendance (id, created_at, participation_id, at, method, sim_date) VALUES (?,?,?,?,?,?)',
    nanoid(), ctx.now, p.id, `${ctx.simDate}T${ctx.simTime}`, method, ctx.simDate,
  );
  return (await ctx.db.first<{ at: string; method: string }>('SELECT at, method FROM attendance WHERE participation_id = ?', p.id))!;
}

/** Participant enters the 6-digit code (current or previous minute) inside the window. */
export const attend: Handler = async (req, ctx, params) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const c = await loadOffline(ctx, params.id);
  if (c instanceof Response) return c;
  if ((settingsOf(c) as OfflineSettings).attendance !== 'qr') return fail(409, 'NO_QR', '이 모임은 출석 코드를 쓰지 않아요');
  const p = await ctx.db.first<ParticipationRow>("SELECT * FROM participations WHERE campaign_id = ? AND user_id = ? AND state = 'applied'", c.id, uid);
  if (!p) return fail(403, 'NOT_PARTICIPANT', '신청이 확정된 사람만 출석할 수 있어요');
  if (!attendanceOpen(ctx, c)) return fail(409, 'ATTENDANCE_CLOSED', '출석은 모임 시작 1시간 전부터 끝난 뒤 1시간까지 할 수 있어요');
  const body = (await readBody(req)) ?? {};
  const code = str(body.code);
  const b = bucketNow(ctx);
  const ok = /^\d{6}$/.test(code) && (safeEqual(code, await attendanceCode(ctx.secret, c.id, b)) || safeEqual(code, await attendanceCode(ctx.secret, c.id, b - 1)));
  if (!ok) return fail(400, 'BAD_CODE', '출석 코드가 맞지 않아요. 화면의 새 코드를 넣어 주세요');
  const a = await recordAttendance(ctx, p, 'qr');
  return json({ attended: true, at: a.at, method: a.method });
};

async function loadForStaff(ctx: Ctx, participationId: string): Promise<{ p: ParticipationRow; c: CampaignRow } | Response> {
  const p = await ctx.db.first<ParticipationRow>('SELECT * FROM participations WHERE id = ?', participationId);
  const c = p ? await loadCampaignRow(ctx, p.campaign_id) : null;
  if (!p || !c) return fail(404, 'PARTICIPATION_NOT_FOUND', '참여 정보를 찾을 수 없어요');
  if (c.type !== 'offline') return fail(400, 'NOT_OFFLINE', '오프라인 모임에서만 출석을 받아요');
  if (!(await isCampaignStaff(ctx, c))) return fail(403, 'NOT_STAFF', '관리자 · 운영진만 할 수 있어요');
  return { p, c };
}

/** 명단 체크 (also usable with QR mode as a fallback). */
export const attendManual: Handler = async (_req, ctx, params) => {
  const l = await loadForStaff(ctx, params.id);
  if (l instanceof Response) return l;
  if (l.p.state !== 'applied') return fail(409, 'NOT_CONFIRMED', '신청이 확정된 사람만 출석 처리할 수 있어요');
  const a = await recordAttendance(ctx, l.p, 'manual');
  return json({ attended: true, at: a.at, method: a.method });
};

export const unattend: Handler = async (_req, ctx, params) => {
  const l = await loadForStaff(ctx, params.id);
  if (l instanceof Response) return l;
  await ctx.db.run('DELETE FROM attendance WHERE participation_id = ?', l.p.id);
  return json({ attended: false });
};
