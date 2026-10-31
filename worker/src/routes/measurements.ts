import { nanoid } from 'nanoid';
import { ACTIONS, calculate, CONFIG, POLICIES_REDUCE, POLICIES_SOCIAL, SOCIAL_FOUNDATION, type Answers } from '@shared/calculator';
import { addDays } from '@shared/date';
import { fail, json, type Ctx, type Handler } from '../db';
import { scheduleOf, visibleTo } from './campaigns';
import { loadCampaignRow } from './participations';
import { readBody, requireUser, str } from './common';

const PLACES = ['home', 'menu', 'campaign'] as const;
const KINDS = ['start', 'end', 'plain'] as const;
const SOCIAL_ITEMS = new Set(SOCIAL_FOUNDATION.flatMap((s) => s.items));
const ACTION_IDS = new Set(ACTIONS.map((a) => a.id));
const MAX_CLAIM = 50;

interface MeasurementRow {
  id: string; created_at: string; user_id: string | null; local_id: string | null; answers_json: string; result_json: string;
  actions_json: string; social_json: string; policies_json: string; place: string; campaign_id: string | null; kind: string; sim_date: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Answers are numbers, arrays of numbers/strings, or {key: count}. */
function validAnswers(v: unknown): v is Answers {
  if (!isObj(v) || Object.keys(v).length > 100) return false;
  return Object.values(v).every((x) =>
    x === undefined || isNum(x)
    || (Array.isArray(x) && x.length <= 50 && x.every((y) => isNum(y) || (typeof y === 'string' && y.length <= 40)))
    || (isObj(x) && Object.keys(x).length <= 50 && Object.values(x).every(isNum)));
}

export const measurementView = (m: MeasurementRow) => ({
  id: m.id, userId: m.user_id, localId: m.local_id, answers: JSON.parse(m.answers_json), result: JSON.parse(m.result_json),
  actions: JSON.parse(m.actions_json), social: JSON.parse(m.social_json), policies: JSON.parse(m.policies_json),
  place: m.place, campaignId: m.campaign_id, kind: m.kind, simDate: m.sim_date, createdAt: m.created_at,
});

const load = (ctx: Ctx, id: string) => ctx.db.first<MeasurementRow>('SELECT * FROM measurements WHERE id = ?', id);
const notFound = () => fail(404, 'MEASUREMENT_NOT_FOUND', '측정 기록을 찾을 수 없어요');

/** Saves a calculator run; the server recomputes the result from the answers. Guests pass a localId. */
export const createMeasurement: Handler = async (req, ctx) => {
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const localId = str(body.localId);
  if (!ctx.userId && !localId) return fail(400, 'LOCAL_ID_REQUIRED', '비회원 측정에는 임시 저장 ID가 필요해요');
  if (localId.length > 64) return fail(400, 'BAD_LOCAL_ID', '임시 저장 ID가 너무 길어요');
  if (!validAnswers(body.answers) || JSON.stringify(body.answers).length > 10_000) return fail(400, 'BAD_ANSWERS', '계산기 응답이 올바르지 않아요');
  const place = body.place as (typeof PLACES)[number];
  if (!PLACES.includes(place)) return fail(400, 'BAD_PLACE', '측정 위치가 올바르지 않아요');
  let kind = (body.kind ?? 'plain') as (typeof KINDS)[number];
  if (!KINDS.includes(kind)) return fail(400, 'BAD_KIND', '측정 종류가 올바르지 않아요');
  let campaignId: string | null = null;
  if (body.campaignId !== undefined && body.campaignId !== null) {
    const c = typeof body.campaignId === 'string' ? await loadCampaignRow(ctx, body.campaignId) : null;
    if (!c || !visibleTo(ctx, c)) return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
    campaignId = c.id;
    if (kind === 'end') {
      // 마무리 측정 counts only inside the run window (by my date); otherwise it is an ordinary measurement.
      const s = scheduleOf(c);
      const inRun = !!s.runStart && !!s.runDays && ctx.simDate >= s.runStart && ctx.simDate <= addDays(s.runStart, s.runDays - 1);
      if (!inRun) kind = 'plain';
    }
  } else if (kind !== 'plain') {
    return fail(400, 'CAMPAIGN_REQUIRED', '출발점 · 마무리 측정에는 캠페인이 필요해요');
  }
  if (place === 'campaign' && !campaignId) return fail(400, 'CAMPAIGN_REQUIRED', '캠페인에서 잰 측정에는 캠페인이 필요해요');

  let result;
  try {
    const { ans: _ans, ...rest } = calculate(body.answers);
    result = rest;
  } catch {
    return fail(400, 'BAD_ANSWERS', '계산기 응답이 올바르지 않아요');
  }
  if (!Number.isFinite(result.total)) return fail(400, 'BAD_ANSWERS', '계산기 응답이 올바르지 않아요');

  const id = nanoid();
  const stmts: Array<[string, unknown[]]> = [[
    'INSERT INTO measurements (id, created_at, user_id, local_id, answers_json, result_json, place, campaign_id, kind, sim_date) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, ctx.now, ctx.userId, localId || null, JSON.stringify(body.answers), JSON.stringify(result), place, campaignId, kind, ctx.simDate],
  ]];
  if (kind === 'start' && ctx.userId) {
    stmts.push(["UPDATE participations SET start_measurement_id = ? WHERE campaign_id = ? AND user_id = ? AND state <> 'cancelled'", [id, campaignId, ctx.userId]]);
  }
  await ctx.db.batch(stmts);
  return json({ measurement: measurementView((await load(ctx, id))!) }, 201);
};

function uniqStrings(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v) || v.length > max || v.some((x) => typeof x !== 'string') || new Set(v).size !== v.length) return null;
  return v as string[];
}

/** 감축 행동 (5.9톤 초과, 최대 3개) · 사회적 기초 응답 (5.9톤 이하) · 정책 (matching list). */
export const putChoices: Handler = async (req, ctx, params) => {
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const m = await load(ctx, params.id);
  if (!m) return notFound();
  const mine = ctx.userId ? m.user_id === ctx.userId : !m.user_id && !!m.local_id && m.local_id === str(body.localId);
  if (!mine) return notFound();
  const total = (JSON.parse(m.result_json) as { total: number }).total;
  const over = total > CONFIG.TARGET_2030;
  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.actions !== undefined) {
    const a = uniqStrings(body.actions, CONFIG.ACTIONS_TO_PICK);
    if (!over) return fail(400, 'NO_ACTIONS', '5.9톤 이하에서는 감축 행동을 고르지 않아요');
    if (!a || a.some((x) => !ACTION_IDS.has(x))) return fail(400, 'BAD_ACTIONS', `감축 행동은 ${CONFIG.ACTIONS_TO_PICK}개까지 고를 수 있어요`);
    sets.push('actions_json = ?'); args.push(JSON.stringify(a));
  }
  if (body.social !== undefined) {
    const s = uniqStrings(body.social, SOCIAL_ITEMS.size);
    if (over) return fail(400, 'NO_SOCIAL', '사회적 기초 문항은 5.9톤 이하에서만 답해요');
    if (!s || s.some((x) => !SOCIAL_ITEMS.has(x))) return fail(400, 'BAD_SOCIAL', '사회적 기초 응답이 올바르지 않아요');
    sets.push('social_json = ?'); args.push(JSON.stringify(s));
  }
  if (body.policies !== undefined) {
    const list: readonly string[] = over ? POLICIES_REDUCE : POLICIES_SOCIAL;
    const p = uniqStrings(body.policies, list.length);
    if (!p || p.some((x) => !list.includes(x))) return fail(400, 'BAD_POLICIES', '정책 목록에서 골라 주세요');
    sets.push('policies_json = ?'); args.push(JSON.stringify(p));
  }
  if (sets.length) await ctx.db.run(`UPDATE measurements SET ${sets.join(', ')} WHERE id = ?`, ...args, m.id);
  return json({ measurement: measurementView((await load(ctx, m.id))!) });
};

/** 가입 직후 비회원 측정 옮기기: only unowned rows move. */
export const claimMeasurements: Handler = async (req, ctx) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const body = await readBody(req);
  const ids = uniqStrings(body?.localIds, MAX_CLAIM)?.filter((x) => x.length > 0 && x.length <= 64);
  if (!ids) return fail(400, 'BAD_LOCAL_IDS', `임시 저장 ID는 ${MAX_CLAIM}개까지 옮길 수 있어요`);
  if (ids.length === 0) return json({ claimed: 0 });
  const r = await ctx.db.run(`UPDATE measurements SET user_id = ? WHERE user_id IS NULL AND local_id IN (${ids.map(() => '?').join(',')})`, uid, ...ids);
  return json({ claimed: r.changes });
};

/** 나의 탄소 기록 (newest first). */
export const myMeasurements: Handler = async (_req, ctx) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const rows = await ctx.db.all<MeasurementRow>('SELECT * FROM measurements WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200', uid);
  return json({ items: rows.map(measurementView) });
};
