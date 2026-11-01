import { nanoid } from 'nanoid';
import { canApply, participantPhase } from '@shared/campaignStatus';
import { addDays } from '@shared/date';
import type { OfflineSettings, PracticeSettings, SignatureSettings } from '../campaignSettings';
import { fail, json, type Ctx, type Handler } from '../db';
import { notify } from '../notify';
import { checklistKeys, detail as campaignDetail, settingsOf, statusInput, statusOf, visibleTo, type CampaignRow } from './campaigns';
import { getGroup } from './groups';
import { readBody, requireUser, str } from './common';

export interface ParticipationRow {
  id: string;
  created_at: string;
  campaign_id: string;
  user_id: string;
  state: string;
  companions: number;
  consents_json: string;
  answers_json: string;
  waitlist_no: number | null;
  shared_by: string | null;
  sim_date: string | null;
  transport: string;
  start_measurement_id: string | null;
  paused_from: string | null;
  paused_until: string | null;
  pause_used: number;
  quit_reason: string;
  checklist_json: string;
}

const MAX_COMPANIONS = 10;
const PAUSE_DAYS = 7;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const notFound = () => fail(404, 'PARTICIPATION_NOT_FOUND', '참여 정보를 찾을 수 없어요');

export async function loadCampaignRow(ctx: Ctx, id: string): Promise<CampaignRow | null> {
  return ctx.db.first<CampaignRow>('SELECT * FROM campaigns WHERE id = ?', id);
}

export function participationView(ctx: Ctx, p: ParticipationRow, extra: Record<string, unknown> = {}) {
  const paused = !!p.paused_from && !!p.paused_until && ctx.simDate >= p.paused_from && ctx.simDate <= p.paused_until;
  return {
    id: p.id, campaignId: p.campaign_id, userId: p.user_id, state: p.state, companions: p.companions, transport: p.transport,
    waitlistNo: p.waitlist_no, consents: JSON.parse(p.consents_json), answers: JSON.parse(p.answers_json),
    startMeasurementId: p.start_measurement_id, sharedBy: p.shared_by,
    pausedFrom: p.paused_from, pausedUntil: p.paused_until, pauseUsed: !!p.pause_used, paused,
    quitReason: p.quit_reason, createdAt: p.created_at, simDate: p.sim_date, ...extra,
  };
}

async function signatureNo(ctx: Ctx, p: ParticipationRow): Promise<number | null> {
  if (p.state !== 'signed') return null;
  const r = await ctx.db.first<{ n: number }>(
    "SELECT COUNT(*) n FROM participations WHERE campaign_id = ? AND state = 'signed' AND (created_at < ? OR (created_at = ? AND id <= ?))",
    p.campaign_id, p.created_at, p.created_at, p.id,
  );
  return r?.n ?? null;
}

async function viewWithNo(ctx: Ctx, p: ParticipationRow) {
  return participationView(ctx, p, { signatureNo: await signatureNo(ctx, p) });
}

/** Own participation (404 for anyone else). */
export async function loadOwn(ctx: Ctx, id: string): Promise<{ p: ParticipationRow; c: CampaignRow; uid: string } | Response> {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const p = await ctx.db.first<ParticipationRow>('SELECT * FROM participations WHERE id = ?', id);
  if (!p || p.user_id !== uid) return notFound();
  const c = await loadCampaignRow(ctx, p.campaign_id);
  if (!c) return notFound();
  return { p, c, uid };
}

export const reload = async (ctx: Ctx, id: string) => (await ctx.db.first<ParticipationRow>('SELECT * FROM participations WHERE id = ?', id))!;

/** Before 모집 마감 by the caller's date + time. */
function beforeRecruitClose(ctx: Ctx, c: CampaignRow): boolean {
  const s = statusInput(c).schedule;
  if (ctx.simDate < s.recruitEnd) return true;
  if (ctx.simDate > s.recruitEnd) return false;
  return !s.recruitEndTime || ctx.simTime < s.recruitEndTime;
}

/** Auto-join (campaign consent covers approval/private groups); banned members stay banned. */
async function joinHost(ctx: Ctx, c: CampaignRow, uid: string) {
  if (!c.host_group_id) return;
  const g = await getGroup(ctx, c.host_group_id);
  if (!g || g.closed_at) return;
  await ctx.db.run(
    "INSERT INTO group_members (id, created_at, group_id, user_id, role, sim_date) VALUES (?,?,?,?,'member',?) ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'member' WHERE role = 'pending'",
    nanoid(), ctx.now, g.id, uid, ctx.simDate,
  );
}

// ---- participate -------------------------------------------------------------

export const participate: Handler = async (req, ctx, params) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const c = await loadCampaignRow(ctx, params.id);
  if (!c || !visibleTo(ctx, c) || statusOf(ctx, c) === 'draft') return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
  if (!canApply(statusInput(c), ctx.simDate, ctx.simTime)) return fail(409, 'NOT_RECRUITING', '지금은 신청할 수 없어요');
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const settings = settingsOf(c);
  const answers = isObj(body.answers) ? { ...body.answers } : {};
  const consents = isObj(body.consents) ? body.consents : {};
  if (JSON.stringify(answers).length > 5000 || JSON.stringify(consents).length > 2000) return fail(400, 'TOO_LARGE', '신청 내용이 너무 길어요');

  let companions = 0;
  let transport = '';
  if (c.type === 'offline') {
    const o = settings as OfflineSettings;
    if (body.companions !== undefined && body.companions !== null) {
      if (!Number.isInteger(body.companions) || (body.companions as number) < 0 || (body.companions as number) > MAX_COMPANIONS) {
        return fail(400, 'BAD_COMPANIONS', `동반 인원은 0~${MAX_COMPANIONS}명으로 적어 주세요`);
      }
      companions = o.askCompanions ? (body.companions as number) : 0;
    }
    transport = o.askTransport ? str(body.transport).slice(0, 20) : '';
  }
  if (c.type === 'signature') {
    if (consents.delivery !== true) return fail(400, 'CONSENT_REQUIRED', '전달 동의가 필요해요');
    if (typeof answers.region !== 'string' || !answers.region.trim()) {
      const u = await ctx.db.first<{ sido: string }>('SELECT sido FROM users WHERE id = ?', uid);
      answers.region = u?.sido || '전국·온라인';
    }
    for (const k of ['realname', 'opinion'] as const) {
      if (answers[k] !== undefined && (typeof answers[k] !== 'string' || [...(answers[k] as string)].length > (k === 'opinion' ? 100 : 20))) {
        return fail(400, 'BAD_ANSWER', k === 'opinion' ? '한 줄 의견은 100자까지 쓸 수 있어요' : '실명은 20자까지 쓸 수 있어요');
      }
      if (answers[k] !== undefined && !(settings as SignatureSettings).fields.includes(k)) delete answers[k];
    }
  }
  if (c.type === 'practice' && body.reminder !== undefined) {
    const rem = parseReminder(body.reminder, (settings as PracticeSettings).reminderTime);
    if (rem instanceof Response) return rem;
    answers.reminder = rem;
  }

  let startMeasurementId: string | null = null;
  if (typeof body.startMeasurementId === 'string' && body.startMeasurementId) {
    const m = await ctx.db.first('SELECT id FROM measurements WHERE id = ? AND user_id = ?', body.startMeasurementId, uid);
    if (!m) return fail(400, 'BAD_MEASUREMENT', '출발점 측정을 찾을 수 없어요');
    startMeasurementId = body.startMeasurementId;
  } else if (c.type === 'practice') {
    const m = await ctx.db.first<{ id: string }>(
      "SELECT id FROM measurements WHERE user_id = ? AND campaign_id = ? AND kind = 'start' ORDER BY created_at DESC, rowid DESC LIMIT 1", uid, c.id);
    startMeasurementId = m?.id ?? null;
  }
  let sharedBy: string | null = null;
  if (typeof body.sharedBy === 'string' && body.sharedBy && body.sharedBy !== uid) {
    if (await ctx.db.first('SELECT id FROM users WHERE id = ?', body.sharedBy)) sharedBy = body.sharedBy;
  }

  const existing = await ctx.db.first<ParticipationRow>('SELECT * FROM participations WHERE campaign_id = ? AND user_id = ?', c.id, uid);
  if (existing) {
    if (existing.state === 'quit') return fail(409, 'ALREADY_QUIT', '이번 기수에는 다시 참여할 수 없어요');
    if (existing.state !== 'cancelled') return fail(409, 'ALREADY_APPLIED', '이미 신청했어요');
    await ctx.db.run("DELETE FROM participations WHERE id = ? AND state = 'cancelled'", existing.id);
  }

  const id = nanoid();
  const cols = 'id, created_at, campaign_id, user_id, state, companions, consents_json, answers_json, waitlist_no, shared_by, sim_date, transport, start_measurement_id';
  const vals = [id, ctx.now, c.id, uid];
  const rest = [companions, JSON.stringify(consents), JSON.stringify(answers)];
  const tail = [sharedBy, ctx.simDate, transport, startMeasurementId];
  const seats = 1 + companions;
  let inserted = 0;
  try {
    if (c.type === 'signature') {
      inserted = (await ctx.db.run(`INSERT INTO participations (${cols}) VALUES (?,?,?,?,'signed',?,?,?,NULL,?,?,?,?)`, ...vals, ...rest, ...tail)).changes;
    } else {
      const capacity = (settings as PracticeSettings | OfflineSettings).capacity;
      // One conditional INSERT claims the seat(s): concurrent applicants can never oversell.
      // While anyone is waitlisted, newcomers queue behind them.
      inserted = (await ctx.db.run(
        `INSERT INTO participations (${cols}) SELECT ?,?,?,?,'applied',?,?,?,NULL,?,?,?,? WHERE ? IS NULL OR (
           (SELECT COALESCE(SUM(${c.type === 'offline' ? '1 + companions' : '1'}), 0) FROM participations WHERE campaign_id = ? AND state IN ('applied','paused')) + ? <= ?
           AND NOT EXISTS (SELECT 1 FROM participations WHERE campaign_id = ? AND state = 'waitlisted'))`,
        ...vals, ...rest, ...tail, capacity, c.id, c.type === 'offline' ? seats : 1, capacity, c.id,
      )).changes;
      if (!inserted) {
        if (c.type !== 'offline' || !(settings as OfflineSettings).waitlist) return fail(409, 'FULL', '자리가 모두 찼어요');
        if (seats > capacity!) return fail(409, 'FULL', '정원보다 많은 인원은 신청할 수 없어요');
        inserted = (await ctx.db.run(
          `INSERT INTO participations (${cols}) SELECT ?,?,?,?,'waitlisted',?,?,?,COALESCE(MAX(waitlist_no), 0) + 1,?,?,?,? FROM participations WHERE campaign_id = ?`,
          ...vals, ...rest, ...tail, c.id,
        )).changes;
      }
    }
  } catch (e) {
    if (String(e).includes('UNIQUE')) return fail(409, 'ALREADY_APPLIED', '이미 신청했어요');
    throw e;
  }
  if (!inserted) return fail(409, 'FULL', '자리가 모두 찼어요');

  const p = await reload(ctx, id);
  if (c.type === 'signature') await goalAlerts(ctx, c, settings as SignatureSettings);
  if (p.state !== 'waitlisted') {
    const hostJoin = (settings as SignatureSettings).hostJoin;
    if (c.type !== 'signature' || hostJoin === 'auto' || (hostJoin === 'ask' && body.joinHost === true)) await joinHost(ctx, c, uid);
  }
  return json({ participation: await viewWithNo(ctx, p), waitlisted: p.state === 'waitlisted' }, 201);
};

/** 목표 인원 50% · 100% 도달 알림: the signature that crosses a threshold tells every signer (once per campaign + threshold). */
async function goalAlerts(ctx: Ctx, c: CampaignRow, s: SignatureSettings) {
  if (!s.goalAlerts || !s.goal) return;
  const n = (await ctx.db.first<{ n: number }>("SELECT COUNT(*) n FROM participations WHERE campaign_id = ? AND state = 'signed'", c.id))?.n ?? 0;
  for (const pct of [50, 100]) {
    const need = Math.ceil((s.goal * pct) / 100);
    if (n < need || n - 1 >= need) continue;
    const signers = await ctx.db.all<{ user_id: string }>("SELECT user_id FROM participations WHERE campaign_id = ? AND state = 'signed'", c.id);
    const text = pct === 100 ? `「${c.title}」 서명이 목표 인원에 닿았어요` : `「${c.title}」 서명이 목표의 절반을 넘었어요`;
    for (const u of signers) await notify(ctx.db, u.user_id, 'goal_reached', text, `/campaigns/${c.id}`, `goal${pct}:${c.id}:${u.user_id}`, ctx.simDate);
  }
}

function parseReminder(v: unknown, defaultTime: string): Record<string, unknown> | Response {
  if (!isObj(v) || typeof v.enabled !== 'boolean') return fail(400, 'BAD_REMINDER', '미션 알림 설정이 올바르지 않아요');
  const time = v.time === undefined ? defaultTime : v.time;
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail(400, 'BAD_REMINDER', '미션 알림 시각이 올바르지 않아요');
  const channel = v.channel === undefined ? 'push' : v.channel;
  if (!['push', 'email'].includes(channel as string)) return fail(400, 'BAD_REMINDER', '알림 방법이 올바르지 않아요');
  return { enabled: v.enabled, time, channel };
}

export const getParticipation: Handler = async (_req, ctx, params) => {
  const o = await loadOwn(ctx, params.id);
  if (o instanceof Response) return o;
  const a = o.c.type === 'offline'
    ? await ctx.db.first<{ at: string; method: string }>('SELECT at, method FROM attendance WHERE participation_id = ?', o.p.id)
    : null;
  return json({ participation: { ...(await viewWithNo(ctx, o.p)), attendance: a } });
};

/** 미션 알림 켜기 (stored in answers.reminder; only shown, never sent). */
export const putReminder: Handler = async (req, ctx, params) => {
  const o = await loadOwn(ctx, params.id);
  if (o instanceof Response) return o;
  if (o.c.type !== 'practice') return fail(400, 'NOT_PRACTICE', '실천 캠페인에서만 쓸 수 있어요');
  const rem = parseReminder(await readBody(req), (settingsOf(o.c) as PracticeSettings).reminderTime);
  if (rem instanceof Response) return rem;
  await ctx.db.run("UPDATE participations SET answers_json = json_set(answers_json, '$.reminder', json(?)) WHERE id = ?", JSON.stringify(rem), o.p.id);
  return json({ participation: participationView(ctx, await reload(ctx, o.p.id)) });
};

// ---- cancel / pause / quit ---------------------------------------------------

/** Promotes waitlisted applicants in order while seats allow; each UPDATE re-checks capacity atomically. */
export async function promoteWaitlist(ctx: Ctx, c: CampaignRow) {
  const capacity = (settingsOf(c) as OfflineSettings).capacity ?? 1_000_000;
  for (let i = 0; i < 1000; i++) {
    const row = await ctx.db.first<{ id: string; user_id: string }>(
      `UPDATE participations SET state = 'applied', waitlist_no = NULL, updated_sim_date = ?
       WHERE id = (SELECT id FROM participations WHERE campaign_id = ? AND state = 'waitlisted' ORDER BY waitlist_no, created_at, id LIMIT 1)
         AND state = 'waitlisted'
         AND (SELECT COALESCE(SUM(1 + p2.companions), 0) FROM participations p2 WHERE p2.campaign_id = ? AND p2.state = 'applied') + 1 + companions <= ?
       RETURNING id, user_id`,
      ctx.simDate, c.id, c.id, capacity,
    );
    if (!row) return;
    await notify(ctx.db, row.user_id, 'waitlist_confirmed', `「${c.title}」 대기 신청이 확정됐어요`, `/campaigns/${c.id}`, `waitlist_confirmed:${row.id}`, ctx.simDate);
    await joinHost(ctx, c, row.user_id);
  }
}

export const cancelParticipation: Handler = async (_req, ctx, params) => {
  const o = await loadOwn(ctx, params.id);
  if (o instanceof Response) return o;
  const { p, c } = o;
  if (p.state === 'cancelled') return json({ participation: participationView(ctx, p) }); // idempotent
  if (c.type === 'practice') {
    if (participantPhase(statusInput(c), ctx.simDate) !== 'before') return fail(409, 'CANNOT_CANCEL', '진행이 시작되면 취소 대신 그만두기를 해 주세요');
  } else if (!beforeRecruitClose(ctx, c)) {
    return fail(409, 'CANNOT_CANCEL', c.type === 'signature' ? '서명 마감 뒤에는 취소할 수 없어요' : '모집 마감 뒤에는 취소할 수 없어요');
  }
  const from = c.type === 'signature' ? ['signed'] : ['applied', 'waitlisted'];
  if (!from.includes(p.state)) return fail(409, 'CANNOT_CANCEL', '취소할 수 없는 상태예요');
  // Conditional transition: of concurrent cancels exactly one sees changes = 1 and promotes.
  const r = await ctx.db.run(
    `UPDATE participations SET state = 'cancelled', waitlist_no = NULL, updated_sim_date = ? WHERE id = ? AND state IN (${from.map(() => '?').join(',')})`,
    ctx.simDate, p.id, ...from,
  );
  // A freed seat (or a waitlist head leaving) can let the next waitlisted applicant in.
  if (r.changes && c.type === 'offline') await promoteWaitlist(ctx, c);
  return json({ participation: participationView(ctx, await reload(ctx, p.id)) });
};

export const pauseParticipation: Handler = async (_req, ctx, params) => {
  const o = await loadOwn(ctx, params.id);
  if (o instanceof Response) return o;
  const { p, c } = o;
  if (c.type !== 'practice') return fail(400, 'NOT_PRACTICE', '실천 캠페인에서만 쉬어 갈 수 있어요');
  if (p.state !== 'applied') return fail(409, 'NOT_ACTIVE', '참여 중일 때만 쉬어 갈 수 있어요');
  if (participantPhase(statusInput(c), ctx.simDate) !== 'running') return fail(409, 'NOT_RUNNING', '진행 기간에만 쉬어 갈 수 있어요');
  const until = addDays(ctx.simDate, PAUSE_DAYS - 1);
  const r = await ctx.db.run(
    "UPDATE participations SET paused_from = ?, paused_until = ?, pause_used = 1, updated_sim_date = ? WHERE id = ? AND pause_used = 0 AND state = 'applied'",
    ctx.simDate, until, ctx.simDate, p.id,
  );
  if (!r.changes) return fail(409, 'PAUSE_USED', '쉬어 가기는 한 기수에 한 번만 할 수 있어요');
  return json({ participation: participationView(ctx, await reload(ctx, p.id)) });
};

export const quitParticipation: Handler = async (req, ctx, params) => {
  const o = await loadOwn(ctx, params.id);
  if (o instanceof Response) return o;
  const { p, c } = o;
  if (c.type !== 'practice') return fail(400, 'NOT_PRACTICE', '실천 캠페인에서만 그만둘 수 있어요');
  const body = (await readBody(req)) ?? {};
  const reason = str(body.reason);
  if ([...reason].length > 200) return fail(400, 'BAD_REASON', '이유는 200자까지 쓸 수 있어요');
  const r = await ctx.db.run(
    "UPDATE participations SET state = 'quit', quit_reason = ?, updated_sim_date = ? WHERE id = ? AND state = 'applied'",
    reason, ctx.simDate, p.id,
  );
  if (!r.changes) return fail(409, 'NOT_ACTIVE', '참여 중일 때만 그만둘 수 있어요');
  return json({ participation: participationView(ctx, await reload(ctx, p.id)) });
};

// ---- checklist ---------------------------------------------------------------

/** Marks a checklist item done for the caller (auto items without a server-side signal, admin link items). */
export const checklistDone: Handler = async (_req, ctx, params) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const c = await loadCampaignRow(ctx, params.id);
  if (!c || !visibleTo(ctx, c)) return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
  const p = await ctx.db.first<ParticipationRow>("SELECT * FROM participations WHERE campaign_id = ? AND user_id = ? AND state <> 'cancelled'", c.id, uid);
  if (!p) return fail(403, 'NOT_PARTICIPANT', '참가자만 할 수 있어요');
  const keys = await checklistKeys(ctx, c);
  if (!keys.includes(params.itemId)) return fail(404, 'ITEM_NOT_FOUND', '체크리스트 항목을 찾을 수 없어요');
  await ctx.db.run("UPDATE participations SET checklist_json = json_set(checklist_json, '$.' || json_quote(?), json('true')) WHERE id = ?", params.itemId, p.id);
  return json({ ok: true });
};

/** GET /api/me/participations — 내 참여 목록: 캠페인 상세(내 상태 · 미션 포함), 최근 신청순. 초안 캠페인은 제외. */
export const myParticipations: Handler = async (_req, ctx) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const rows = await ctx.db.all<ParticipationRow>("SELECT * FROM participations WHERE user_id = ? AND state <> 'cancelled' ORDER BY created_at DESC, id DESC LIMIT 100", uid);
  const items = [];
  for (const p of rows) {
    const c = await loadCampaignRow(ctx, p.campaign_id);
    if (!c || c.publish === 'draft') continue;
    items.push(await campaignDetail(ctx, c));
  }
  return json({ items });
};
