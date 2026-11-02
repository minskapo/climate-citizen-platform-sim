import { nanoid } from 'nanoid';
import { fail, json, type Ctx, type Handler } from '../db';
import { canUseExclusive } from './campaigns';
import { readBody, requireAdmin, requireUser, str } from './common';

const HTML_MAX = 1024 * 1024;
const PERMS = ['user', 'participation', 'record'] as const;
const OPS = ['sum', 'avg', 'count'] as const;
const KEY_RE = /^[A-Za-z0-9_]{1,40}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export interface Manifest {
  permissions: (typeof PERMS)[number][];
  saveKeys: string[];
  aggregateKeys: Array<{ key: string; op: (typeof OPS)[number] }>;
  startPoint: boolean;
}

interface ToolRow { id: string; created_at: string; name: string; slug: string | null; kind: string }
interface VersionRow { id: string; tool_id: string; html: string; manifest_json: string; status: string; version: number; created_at: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bytes = (s: string) => new TextEncoder().encode(s).byteLength;

export function parseManifest(v: unknown): Manifest | string {
  if (!isObj(v)) return '설명(manifest) 형식이 올바르지 않아요';
  const permissions = v.permissions ?? [];
  if (!Array.isArray(permissions) || permissions.some((x) => !PERMS.includes(x as never))) return '필요한 권한이 올바르지 않아요';
  const saveKeys = v.saveKeys ?? [];
  if (!Array.isArray(saveKeys) || saveKeys.length > 30 || saveKeys.some((k) => typeof k !== 'string' || !KEY_RE.test(k))) return '저장 값 이름이 올바르지 않아요';
  const agg = v.aggregateKeys ?? [];
  if (!Array.isArray(agg) || agg.length > 30 || agg.some((a) => !isObj(a) || typeof a.key !== 'string' || !KEY_RE.test(a.key) || !OPS.includes(a.op as never))) return '집계 값이 올바르지 않아요';
  if (v.startPoint !== undefined && typeof v.startPoint !== 'boolean') return '출발점 도구 값이 올바르지 않아요';
  return {
    permissions: [...new Set(permissions as Manifest['permissions'])], saveKeys: [...new Set(saveKeys as string[])],
    aggregateKeys: agg as Manifest['aggregateKeys'], startPoint: v.startPoint === true,
  };
}

function checkVersionBody(b: Record<string, unknown>): { html: string; manifest: Manifest } | Response {
  if (typeof b.html !== 'string' || !b.html.trim()) return fail(400, 'BAD_HTML', 'HTML 내용이 필요해요');
  if (bytes(b.html) > HTML_MAX) return fail(413, 'HTML_TOO_LARGE', 'HTML은 1MB 이하만 올릴 수 있어요');
  const m = parseManifest(b.manifest ?? {});
  if (typeof m === 'string') return fail(400, 'BAD_MANIFEST', m);
  return { html: b.html, manifest: m };
}

/** Tool by id or slug. */
async function loadTool(ctx: Ctx, idOrSlug: string): Promise<ToolRow | null> {
  return ctx.db.first<ToolRow>('SELECT * FROM tools WHERE id = ? OR slug = ?', idOrSlug, idOrSlug);
}

/** If any campaign links the tool as 캠페인 전용, the caller must qualify for one of them. */
async function exclusiveOk(ctx: Ctx, toolId: string): Promise<boolean> {
  const rows = await ctx.db.all<{ campaign_id: string; host_group_id: string | null }>(
    'SELECT ct.campaign_id, c.host_group_id FROM campaign_tools ct LEFT JOIN campaigns c ON c.id = ct.campaign_id WHERE ct.tool_id = ? AND ct.exclusive = 1', toolId);
  if (rows.length === 0) return true;
  for (const r of rows) if (await canUseExclusive(ctx, r.campaign_id, r.host_group_id)) return true;
  return false;
}

const publishedOf = (ctx: Ctx, toolId: string) =>
  ctx.db.first<VersionRow>("SELECT * FROM tool_versions WHERE tool_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1", toolId);

const versionView = (v: VersionRow) => ({ version: v.version, status: v.status, createdAt: v.created_at, manifest: JSON.parse(v.manifest_json), htmlBytes: bytes(v.html) });

export const createTool: Handler = async (req, ctx) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const b = await readBody(req);
  if (!b) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const name = str(b.name), slug = str(b.slug), kind = str(b.kind);
  if (!name || [...name].length > 40) return fail(400, 'BAD_NAME', '이름을 40자 이내로 써 주세요');
  if (!SLUG_RE.test(slug)) return fail(400, 'BAD_SLUG', '주소는 영문 소문자 · 숫자 · 하이픈 2~40자로 써 주세요');
  if (kind !== 'block' && kind !== 'page') return fail(400, 'BAD_KIND', '규격은 블록형이나 페이지형이어야 해요');
  const v = checkVersionBody(b);
  if (v instanceof Response) return v;
  if (await ctx.db.first('SELECT id FROM tools WHERE slug = ?', slug)) return fail(409, 'SLUG_TAKEN', '이미 쓰는 주소예요');
  const id = nanoid();
  try {
    await ctx.db.batch([
      ['INSERT INTO tools (id, created_at, name, owner_id, sim_date, slug, kind) VALUES (?,?,?,?,?,?,?)', [id, ctx.now, name, ctx.userId, ctx.simDate, slug, kind]],
      ["INSERT INTO tool_versions (id, created_at, tool_id, html, manifest_json, status, sim_date, version) VALUES (?,?,?,?,?,'pending',?,1)", [nanoid(), ctx.now, id, v.html, JSON.stringify(v.manifest), ctx.simDate]],
    ]);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return fail(409, 'SLUG_TAKEN', '이미 쓰는 주소예요');
    throw e;
  }
  return json({ id, slug, version: 1, status: 'pending' }, 201);
};

export const addVersion: Handler = async (req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const t = await loadTool(ctx, p.id);
  if (!t) return fail(404, 'TOOL_NOT_FOUND', '웹 도구를 찾을 수 없어요');
  const b = await readBody(req);
  if (!b) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const v = checkVersionBody(b);
  if (v instanceof Response) return v;
  const next = ((await ctx.db.first<{ m: number | null }>('SELECT MAX(version) m FROM tool_versions WHERE tool_id = ?', t.id))?.m ?? 0) + 1;
  await ctx.db.run("INSERT INTO tool_versions (id, created_at, tool_id, html, manifest_json, status, sim_date, version) VALUES (?,?,?,?,?,'pending',?,?)",
    nanoid(), ctx.now, t.id, v.html, JSON.stringify(v.manifest), ctx.simDate, next);
  return json({ version: next, status: 'pending' }, 201);
};

/** Makes one version the only published one (others published → archived). */
async function publishVersion(ctx: Ctx, toolId: string, version: number, from: string[]): Promise<Response | null> {
  const v = await ctx.db.first<VersionRow>('SELECT * FROM tool_versions WHERE tool_id = ? AND version = ?', toolId, version);
  if (!v) return fail(404, 'VERSION_NOT_FOUND', '버전을 찾을 수 없어요');
  if (!from.includes(v.status)) return fail(409, 'BAD_VERSION_STATE', '게시할 수 없는 버전이에요');
  await ctx.db.batch([
    ["UPDATE tool_versions SET status = 'archived' WHERE tool_id = ? AND status = 'published'", [toolId]],
    ["UPDATE tool_versions SET status = 'published' WHERE id = ?", [v.id]],
  ]);
  return null;
}

export const publishToolVersion: Handler = async (_req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const t = await loadTool(ctx, p.id);
  if (!t) return fail(404, 'TOOL_NOT_FOUND', '웹 도구를 찾을 수 없어요');
  const v = Number(p.v);
  if (!Number.isInteger(v)) return fail(404, 'VERSION_NOT_FOUND', '버전을 찾을 수 없어요');
  return (await publishVersion(ctx, t.id, v, ['pending'])) ?? json({ version: v, status: 'published' });
};

export const rollbackTool: Handler = async (req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const t = await loadTool(ctx, p.id);
  if (!t) return fail(404, 'TOOL_NOT_FOUND', '웹 도구를 찾을 수 없어요');
  const to = (await readBody(req))?.toVersion;
  if (!Number.isInteger(to)) return fail(400, 'BAD_VERSION', '되돌릴 버전을 골라 주세요');
  return (await publishVersion(ctx, t.id, to as number, ['archived'])) ?? json({ version: to, status: 'published' });
};

export const listTools: Handler = async (_req, ctx) => {
  const tools = await ctx.db.all<ToolRow>('SELECT * FROM tools ORDER BY created_at DESC');
  const admin = ctx.role === 'admin';
  const out = [];
  for (const t of tools) {
    const pub = await publishedOf(ctx, t.id);
    if (!admin && (!pub || !(await exclusiveOk(ctx, t.id)))) continue;
    out.push({
      id: t.id, name: t.name, slug: t.slug, kind: t.kind, createdAt: t.created_at,
      published: pub ? { version: pub.version, manifest: JSON.parse(pub.manifest_json) } : null,
      ...(admin ? {
        usedBy: await ctx.db.all<{ id: string; title: string }>(
          'SELECT DISTINCT c.id, c.title FROM campaign_tools ct JOIN campaigns c ON c.id = ct.campaign_id WHERE ct.tool_id = ? ORDER BY c.title', t.id),
      } : {}),
      ...(admin ? { versions: (await ctx.db.all<VersionRow>('SELECT * FROM tool_versions WHERE tool_id = ? ORDER BY version DESC', t.id)).map(versionView) } : {}),
    });
  }
  return json({ items: out });
};

/** Public (exclusive tools: participants only). Admin may pass ?version=N to preview a pending version. */
export const getPublished: Handler = async (req, ctx, p) => {
  const t = await loadTool(ctx, p.id);
  if (!t) return fail(404, 'TOOL_NOT_FOUND', '웹 도구를 찾을 수 없어요');
  const want = new URL(req.url).searchParams.get('version');
  let v: VersionRow | null;
  if (want && ctx.role === 'admin') v = await ctx.db.first<VersionRow>('SELECT * FROM tool_versions WHERE tool_id = ? AND version = ?', t.id, Number(want));
  else v = await publishedOf(ctx, t.id);
  if (!v) return fail(404, 'NOT_PUBLISHED', '아직 게시되지 않은 웹 도구예요');
  if (!(await exclusiveOk(ctx, t.id))) return fail(403, 'FORBIDDEN', '참가자만 쓸 수 있는 웹 도구예요');
  return json({ id: t.id, name: t.name, slug: t.slug, version: v.version, html: v.html, manifest: JSON.parse(v.manifest_json), kind: t.kind });
};

const isPreview = (req: Request, ctx: Ctx) => req.headers.get('X-Preview') === '1' && ctx.role === 'admin';

export const saveToolRecord: Handler = async (req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const t = await loadTool(ctx, p.id);
  if (!t) return fail(404, 'TOOL_NOT_FOUND', '웹 도구를 찾을 수 없어요');
  const preview = isPreview(req, ctx);
  const v = preview
    ? await ctx.db.first<VersionRow>('SELECT * FROM tool_versions WHERE tool_id = ? ORDER BY version DESC LIMIT 1', t.id)
    : await publishedOf(ctx, t.id);
  if (!v) return fail(404, 'NOT_PUBLISHED', '아직 게시되지 않은 웹 도구예요');
  if (!preview && !(await exclusiveOk(ctx, t.id))) return fail(403, 'FORBIDDEN', '참가자만 쓸 수 있는 웹 도구예요');
  const m = JSON.parse(v.manifest_json) as Manifest;
  if (!m.permissions?.includes('record')) return fail(403, 'NO_PERMISSION', '이 도구는 기록을 저장할 수 없어요');
  const b = await readBody(req);
  const values = b?.values;
  if (!isObj(values)) return fail(400, 'BAD_VALUES', '저장할 값이 올바르지 않아요');
  for (const [k, val] of Object.entries(values)) {
    if (!m.saveKeys.includes(k)) return fail(400, 'BAD_KEY', `저장할 수 없는 값이에요: ${k}`);
    if (!(typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' || val === null)) return fail(400, 'BAD_VALUE', '값은 글자 · 숫자 · 참/거짓만 저장할 수 있어요');
    if (typeof val === 'string' && [...val].length > 500) return fail(400, 'BAD_VALUE', '글자 값은 500자까지 저장할 수 있어요');
  }
  let campaignId: string | null = null;
  if (b?.campaignId !== undefined && b.campaignId !== null && b.campaignId !== '') {
    campaignId = str(b.campaignId);
    if (!(await ctx.db.first('SELECT id FROM campaigns WHERE id = ?', campaignId))) return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
  }
  const id = nanoid();
  await ctx.db.run('INSERT INTO tool_records (id, created_at, tool_id, user_id, campaign_id, data_json, sim_date, preview) VALUES (?,?,?,?,?,?,?,?)',
    id, ctx.now, t.id, uid, campaignId, JSON.stringify(values), ctx.simDate, preview ? 1 : 0);
  return json({ id, preview }, 201);
};

export const myToolRecords: Handler = async (req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const t = await loadTool(ctx, p.id);
  if (!t) return fail(404, 'TOOL_NOT_FOUND', '웹 도구를 찾을 수 없어요');
  const preview = isPreview(req, ctx) ? 1 : 0;
  const rows = await ctx.db.all<{ id: string; campaign_id: string | null; data_json: string; created_at: string; sim_date: string | null }>(
    'SELECT id, campaign_id, data_json, created_at, sim_date FROM tool_records WHERE tool_id = ? AND user_id = ? AND preview = ? ORDER BY created_at DESC, rowid DESC LIMIT 200',
    t.id, uid, preview);
  return json({ items: rows.map((r) => ({ id: r.id, campaignId: r.campaign_id, values: JSON.parse(r.data_json), createdAt: r.created_at, simDate: r.sim_date })) });
};
