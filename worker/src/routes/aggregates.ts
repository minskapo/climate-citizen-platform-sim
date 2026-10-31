import type { SignatureSettings } from '../campaignSettings';
import { fail, json, type Handler } from '../db';
import { settingsOf, visibleTo } from './campaigns';
import { loadCampaignRow } from './participations';

const MIN_AVG = 3;
const MIN_REGION = 10;

/** Latest measurement per member (created order). */
const LATEST = `SELECT m.* FROM measurements m WHERE m.user_id IS NOT NULL AND m.rowid = (
  SELECT m2.rowid FROM measurements m2 WHERE m2.user_id = m.user_id ORDER BY m2.created_at DESC, m2.rowid DESC LIMIT 1)`;

/** 참여자 평균 (3명 미만이면 null) · 정책별 시민 수 (두 목록을 합친 정책 이름 기준; 가입 후 공개). */
export const calculatorAggregate: Handler = async (_req, ctx) => {
  const rows = await ctx.db.all<{ result_json: string; policies_json: string }>(`SELECT result_json, policies_json FROM (${LATEST})`);
  const totals = rows.map((r) => (JSON.parse(r.result_json) as { total?: number }).total).filter((t): t is number => typeof t === 'number');
  const policyCounts: Record<string, number> = {};
  if (ctx.userId) {
    for (const r of rows) for (const p of new Set(JSON.parse(r.policies_json) as string[])) policyCounts[p] = (policyCounts[p] ?? 0) + 1;
  }
  return json({
    count: rows.length,
    avg: totals.length >= MIN_AVG ? totals.reduce((a, b) => a + b, 0) / totals.length : null,
    policyCounts,
  });
};

/** 서명 수 · 지역별 서명 수 (10명 미만 지역은 「그 밖의 지역」으로 묶음). */
export const signatureAggregate: Handler = async (_req, ctx, params) => {
  const c = await loadCampaignRow(ctx, params.id);
  if (!c || !visibleTo(ctx, c) || c.type !== 'signature') return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
  const s = settingsOf(c) as SignatureSettings;
  const rows = await ctx.db.all<{ name: string; n: number }>(
    `SELECT COALESCE(NULLIF(TRIM(json_extract(p.answers_json, '$.region')), ''), NULLIF(u.sido, ''), '전국·온라인') name, COUNT(*) n
     FROM participations p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.campaign_id = ? AND p.state = 'signed' GROUP BY name ORDER BY n DESC, name`,
    c.id,
  );
  const count = rows.reduce((a, r) => a + r.n, 0);
  const shown = rows.filter((r) => r.n >= MIN_REGION);
  const rest = rows.filter((r) => r.n < MIN_REGION);
  const admin = ctx.role === 'admin';
  return json({
    count: s.countDisplay === 'hidden' && !admin ? null : count,
    byRegion: s.regionalCounts || admin ? shown.map((r) => ({ name: r.name, n: r.n })) : [],
    other: s.regionalCounts || admin ? { regions: rest.length, n: rest.reduce((a, r) => a + r.n, 0) } : { regions: 0, n: 0 },
  });
};

/** Web-tool aggregate (getAggregate): sum · avg · participants over numeric tool_records values. */
export const toolAggregate: Handler = async (req, ctx, params) => {
  const tool = await ctx.db.first('SELECT id FROM tools WHERE id = ?', params.toolId);
  if (!tool) return fail(404, 'TOOL_NOT_FOUND', '웹 도구를 찾을 수 없어요');
  const v = await ctx.db.first<{ manifest_json: string }>(
    "SELECT manifest_json FROM tool_versions WHERE tool_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 1", params.toolId);
  const declared = v ? (JSON.parse(v.manifest_json || '{}') as { aggregates?: unknown }).aggregates : undefined;
  if (Array.isArray(declared) && !declared.includes(params.key)) return fail(404, 'AGGREGATE_NOT_FOUND', '이 도구가 공개하지 않은 집계 값이에요');
  if (!/^[A-Za-z0-9_]{1,40}$/.test(params.key)) return fail(400, 'BAD_KEY', '집계 값 이름이 올바르지 않아요');
  const campaignId = new URL(req.url).searchParams.get('campaignId');
  const r = await ctx.db.first<{ n: number; people: number; sum: number | null; avg: number | null }>(
    `SELECT COUNT(*) n, COUNT(DISTINCT user_id) people, SUM(val) sum, AVG(val) avg FROM (
       SELECT user_id, json_extract(data_json, '$.' || ?) val FROM tool_records WHERE tool_id = ? ${campaignId ? 'AND campaign_id = ?' : ''}
     ) WHERE typeof(val) IN ('integer', 'real')`,
    params.key, params.toolId, ...(campaignId ? [campaignId] : []),
  );
  return json({ key: params.key, count: r?.n ?? 0, participants: r?.people ?? 0, sum: r?.sum ?? 0, avg: r?.avg ?? null });
};
