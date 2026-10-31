import { nanoid } from 'nanoid';
import { campaignStatus } from '@shared/campaignStatus';
import type { Schedule } from '@shared/types';
import { notify } from '../notify';
import { fail, json, type Ctx, type Handler } from '../db';
import { DAY_MS, likeEscape, page, PAGE_SIZE, parseCursor, readBody, requireUser, str } from './common';

export const SIDO = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
export const REGIONS = ['전국·온라인', ...SIDO];
const POLICIES = ['open', 'approval', 'private'];
const CLOSED_VISIBLE_DAYS = 30;

export interface GroupRow {
  id: string;
  created_at: string;
  name: string;
  description: string;
  sido: string;
  sigungu: string;
  join_policy: string;
  created_by: string | null;
  chat_link: string;
  categories_json: string;
  closed_at: string | null;
  transfer_to: string | null;
  transfer_expires: string | null;
}

export async function getGroup(ctx: Ctx, id: string): Promise<GroupRow | null> {
  return ctx.db.first<GroupRow>('SELECT * FROM groups WHERE id = ?', id);
}

export async function memberRole(ctx: Ctx, groupId: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const r = await ctx.db.first<{ role: string }>('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId);
  return r?.role ?? null;
}

/** 운영진: owner/staff row, or simulated staff of this very group (spec 5.3). */
export function isStaffRole(ctx: Ctx, groupId: string, role: string | null): boolean {
  return role === 'owner' || role === 'staff' || (ctx.role === 'staff' && ctx.staffGroupId === groupId);
}

export const isMemberRole = (role: string | null) => role === 'owner' || role === 'staff' || role === 'member';

/** Closed groups stay readable for 30 days, then vanish (admins still see them). */
export function closedGone(ctx: Ctx, g: GroupRow): boolean {
  return !!g.closed_at && ctx.role !== 'admin' && Date.parse(ctx.now) - Date.parse(g.closed_at) > CLOSED_VISIBLE_DAYS * DAY_MS;
}

const NOT_FOUND = () => fail(404, 'GROUP_NOT_FOUND', '모임을 찾을 수 없어요');

async function loadStaffGroup(ctx: Ctx, id: string): Promise<{ g: GroupRow; role: string | null } | Response> {
  const g = await getGroup(ctx, id);
  if (!g || closedGone(ctx, g)) return NOT_FOUND();
  const role = await memberRole(ctx, id, ctx.userId);
  if (!isStaffRole(ctx, id, role) && ctx.role !== 'admin') return fail(403, 'NOT_STAFF', '운영진만 할 수 있어요');
  if (g.closed_at) return fail(409, 'GROUP_CLOSED', '닫힌 모임이에요');
  return { g, role };
}

function regionOf(body: Record<string, unknown>): string | Response {
  const sido = str(body.sido) || '전국·온라인';
  return REGIONS.includes(sido) ? sido : fail(400, 'BAD_REGION', '지역은 전국·온라인 또는 광역 이름이어야 해요');
}

function parseCategories(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.map(str).filter(Boolean))];
  if (out.length === 0 || out.length > 10 || out.some((c) => [...c].length > 12)) return null;
  return out.includes('공지') ? out : ['공지', ...out];
}

export const createGroup: Handler = async (req, ctx) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const name = str(body.name);
  if (!name || [...name].length > 30) return fail(400, 'BAD_NAME', '모임 이름은 1~30자로 써 주세요');
  const description = str(body.description);
  if ([...description].length > 500) return fail(400, 'BAD_DESCRIPTION', '소개는 500자까지 쓸 수 있어요');
  const sido = regionOf(body);
  if (sido instanceof Response) return sido;
  const joinPolicy = str(body.joinPolicy) || 'open';
  if (!POLICIES.includes(joinPolicy)) return fail(400, 'BAD_JOIN_POLICY', '가입 방식이 올바르지 않아요');
  const cats = body.categories === undefined ? undefined : parseCategories(body.categories);
  if (cats === null) return fail(400, 'BAD_CATEGORIES', '게시판 분류가 올바르지 않아요');
  const id = nanoid();
  const stmts: Array<[string, unknown[]]> = [
    [
      'INSERT INTO groups (id, created_at, name, description, sido, sigungu, join_policy, created_by, chat_link, sim_date) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, ctx.now, name, description, sido, str(body.sigungu), joinPolicy, uid, str(body.chatLink), ctx.simDate],
    ],
    ['INSERT INTO group_members (id, created_at, group_id, user_id, role, sim_date) VALUES (?,?,?,?,?,?)', [nanoid(), ctx.now, id, uid, 'owner', ctx.simDate]],
  ];
  if (cats) stmts.push(['UPDATE groups SET categories_json = ? WHERE id = ?', [JSON.stringify(cats), id]]);
  await ctx.db.batch(stmts);
  return json(await groupView(ctx, (await getGroup(ctx, id))!), 201);
};

export async function campaignBadge(ctx: Ctx, groupId: string, forClose = false): Promise<{ id: string; title: string; status: string } | null> {
  const rows = await ctx.db.all<{ id: string; title: string; type: string; publish: string; show_upcoming: number; schedule_json: string }>(
    "SELECT id, title, type, publish, show_upcoming, schedule_json FROM campaigns WHERE host_group_id = ? AND publish <> 'draft'",
    groupId,
  );
  const rank: Record<string, number> = { running: 0, recruiting: 1, scheduled: 2 };
  let best: { id: string; title: string; status: string } | null = null;
  for (const c of rows) {
    const st = campaignStatus({ type: c.type as never, publish: c.publish as never, showUpcoming: !!c.show_upcoming, schedule: JSON.parse(c.schedule_json) as Schedule }, ctx.simDate);
    if (!(st in rank) || (st === 'scheduled' && !c.show_upcoming && !forClose)) continue;
    if (!best || rank[st] < rank[best.status]) best = { id: c.id, title: c.title, status: st };
  }
  return best;
}

async function groupView(ctx: Ctx, g: GroupRow) {
  const role = await memberRole(ctx, g.id, ctx.userId);
  const isMember = isMemberRole(role) || ctx.role === 'admin' || (ctx.role === 'staff' && ctx.staffGroupId === g.id);
  const base = { id: g.id, name: g.name, sido: g.sido, sigungu: g.sigungu, joinPolicy: g.join_policy, myRole: role, closed: !!g.closed_at };
  if (g.join_policy === 'private' && !isMember) return base; // 비공개: 이름·지역만
  const count = await ctx.db.first<{ n: number }>("SELECT COUNT(*) n FROM group_members WHERE group_id = ? AND role IN ('owner','staff','member')", g.id);
  const weekAgo = new Date(Date.parse(ctx.simDate) - 7 * DAY_MS).toISOString().slice(0, 10);
  const posts = await ctx.db.first<{ n: number }>(
    "SELECT COUNT(*) n FROM posts WHERE board_type = 'group' AND board_id = ? AND hidden = 0 AND sim_date > ? AND sim_date <= ?",
    g.id, weekAgo, ctx.simDate,
  );
  return {
    ...base,
    description: g.description,
    createdAt: g.created_at,
    categories: JSON.parse(g.categories_json) as string[],
    memberCount: count?.n ?? 0,
    newPostsThisWeek: posts?.n ?? 0,
    campaign: await campaignBadge(ctx, g.id),
    chatLink: isMember ? g.chat_link : undefined, // 단톡방 링크는 멤버에게만
    closedAt: g.closed_at,
    pendingTransferTo: isStaffRole(ctx, g.id, role) ? g.transfer_to : undefined,
  };
}

export const listGroups: Handler = async (req, ctx) => {
  const sp = new URL(req.url).searchParams;
  const where = ['closed_at IS NULL'];
  const args: unknown[] = [];
  if (sp.get('region')) { where.push('sido = ?'); args.push(sp.get('region')); }
  if (sp.get('join')) { where.push('join_policy = ?'); args.push(sp.get('join')); }
  const q = (sp.get('q') ?? '').trim();
  if (q) { where.push("(name LIKE ? ESCAPE '\\' OR (join_policy <> 'private' AND description LIKE ? ESCAPE '\\'))"); args.push(likeEscape(q), likeEscape(q)); }
  const offset = parseCursor(req);
  const rows = await ctx.db.all<GroupRow>(
    `SELECT * FROM groups WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ...args, PAGE_SIZE + 1, offset,
  );
  const shown = rows.slice(0, PAGE_SIZE);
  const items = await Promise.all(shown.map((g) => groupView(ctx, g)));
  return json({ items, nextCursor: rows.length > PAGE_SIZE ? String(offset + PAGE_SIZE) : null });
};

export const getGroupRoute: Handler = async (_req, ctx, p) => {
  const g = await getGroup(ctx, p.id);
  if (!g || closedGone(ctx, g)) return NOT_FOUND();
  return json(await groupView(ctx, g));
};

export const patchGroup: Handler = async (req, ctx, p) => {
  const s = await loadStaffGroup(ctx, p.id);
  if (s instanceof Response) return s;
  const { g } = s;
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  let joinPolicy = g.join_policy;
  if (body.joinPolicy !== undefined) {
    joinPolicy = str(body.joinPolicy);
    if (!POLICIES.includes(joinPolicy)) return fail(400, 'BAD_JOIN_POLICY', '가입 방식이 올바르지 않아요');
  }
  let categories = g.categories_json;
  if (body.categories !== undefined) {
    const c = parseCategories(body.categories);
    if (!c) return fail(400, 'BAD_CATEGORIES', '게시판 분류가 올바르지 않아요');
    categories = JSON.stringify(c);
  }
  let description = g.description;
  if (body.description !== undefined) {
    description = str(body.description);
    if ([...description].length > 500) return fail(400, 'BAD_DESCRIPTION', '소개는 500자까지 쓸 수 있어요');
  }
  const chat = body.chatLink !== undefined ? str(body.chatLink) : g.chat_link;
  await ctx.db.run('UPDATE groups SET join_policy = ?, categories_json = ?, description = ?, chat_link = ? WHERE id = ?', joinPolicy, categories, description, chat, g.id);
  return json(await groupView(ctx, (await getGroup(ctx, g.id))!));
};

export const joinGroup: Handler = async (req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const g = await getGroup(ctx, p.id);
  if (!g || closedGone(ctx, g)) return NOT_FOUND();
  if (g.closed_at) return fail(409, 'GROUP_CLOSED', '닫힌 모임이에요');
  const role = await memberRole(ctx, g.id, uid);
  if (role === 'banned') return fail(403, 'BANNED', '이 모임에는 가입할 수 없어요');
  if (role === 'pending') return fail(409, 'ALREADY_PENDING', '가입 승인을 기다리고 있어요');
  if (role) return fail(409, 'ALREADY_MEMBER', '이미 가입한 모임이에요');
  let next = 'member';
  if (g.join_policy === 'approval') next = 'pending';
  if (g.join_policy === 'private') {
    const body = (await readBody(req)) ?? {};
    const code = str(body.invite);
    const inv = code ? await ctx.db.first<{ expires_at: string | null }>('SELECT expires_at FROM invites WHERE code = ? AND group_id = ?', code, g.id) : null;
    if (!inv || (inv.expires_at && inv.expires_at < ctx.now)) return fail(403, 'INVITE_REQUIRED', '유효한 초대 링크가 필요해요');
  }
  await ctx.db.run('INSERT INTO group_members (id, created_at, group_id, user_id, role, sim_date) VALUES (?,?,?,?,?,?)', nanoid(), ctx.now, g.id, uid, next, ctx.simDate);
  return json({ role: next }, 201);
};

export const leaveGroup: Handler = async (_req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const role = await memberRole(ctx, p.id, uid);
  if (!role || role === 'banned') return fail(404, 'NOT_MEMBER', '가입한 모임이 아니에요');
  if (role === 'owner') return fail(409, 'OWNER_CANNOT_LEAVE', '모임장은 먼저 모임장을 넘겨 주세요');
  await ctx.db.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', p.id, uid);
  await ctx.db.run('UPDATE groups SET transfer_to = NULL, transfer_expires = NULL WHERE id = ? AND transfer_to = ?', p.id, uid);
  return json({ ok: true });
};

export const createInvite: Handler = async (_req, ctx, p) => {
  const s = await loadStaffGroup(ctx, p.id);
  if (s instanceof Response) return s;
  const code = nanoid(16);
  const expiresAt = new Date(Date.parse(ctx.now) + 7 * DAY_MS).toISOString();
  await ctx.db.run('INSERT INTO invites (id, created_at, group_id, code, created_by, expires_at, sim_date) VALUES (?,?,?,?,?,?,?)', nanoid(), ctx.now, p.id, code, ctx.userId, expiresAt, ctx.simDate);
  return json({ url: `#/groups/${p.id}?invite=${code}`, code, expiresAt }, 201);
};

export const memberAction: Handler = async (req, ctx, p) => {
  const s = await loadStaffGroup(ctx, p.id);
  if (s instanceof Response) return s;
  const body = await readBody(req);
  const action = str(body?.action);
  if (!['approve', 'staff', 'unstaff', 'kick', 'ban'].includes(action)) return fail(400, 'BAD_ACTION', '지원하지 않는 동작이에요');
  const targetRole = await memberRole(ctx, p.id, p.uid);
  if (!targetRole) return fail(404, 'NOT_MEMBER', '멤버를 찾을 수 없어요');
  if (targetRole === 'owner') return fail(403, 'TARGET_OWNER', '모임장에게는 할 수 없어요');
  const actorIsOwner = s.role === 'owner' || ctx.role === 'admin';
  if ((action === 'staff' || action === 'unstaff' || targetRole === 'staff') && !actorIsOwner) {
    return fail(403, 'OWNER_ONLY', '모임장만 할 수 있어요');
  }
  const set = (role: string) => ctx.db.run('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?', role, p.id, p.uid);
  const link = `/groups/${p.id}`;
  if (action === 'approve') {
    if (targetRole !== 'pending') return fail(409, 'NOT_PENDING', '승인 대기 중이 아니에요');
    await set('member');
    await notify(ctx.db, p.uid, 'join_approved', `「${s.g.name}」 가입이 승인됐어요`, link, `join_approved:${p.id}:${p.uid}`, ctx.simDate);
  } else if (action === 'staff') {
    if (targetRole !== 'member') return fail(409, 'NOT_MEMBER', '멤버만 운영진으로 지정할 수 있어요');
    await set('staff');
    await notify(ctx.db, p.uid, 'staff_appointed', `「${s.g.name}」 운영진으로 지정됐어요`, link, `staff_appointed:${p.id}:${p.uid}`, ctx.simDate);
  } else if (action === 'unstaff') {
    if (targetRole !== 'staff') return fail(409, 'NOT_STAFF_TARGET', '운영진이 아니에요');
    await set('member');
  } else if (action === 'kick') {
    await ctx.db.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', p.id, p.uid);
  } else {
    await set('banned');
  }
  if (action === 'kick' || action === 'ban') {
    await ctx.db.run('UPDATE groups SET transfer_to = NULL, transfer_expires = NULL WHERE id = ? AND transfer_to = ?', p.id, p.uid);
  }
  return json({ ok: true });
};

async function loadOwnerGroup(ctx: Ctx, id: string): Promise<GroupRow | Response> {
  const g = await getGroup(ctx, id);
  if (!g || closedGone(ctx, g)) return NOT_FOUND();
  if ((await memberRole(ctx, id, ctx.userId)) !== 'owner') return fail(403, 'OWNER_ONLY', '모임장만 할 수 있어요');
  if (g.closed_at) return fail(409, 'GROUP_CLOSED', '닫힌 모임이에요');
  return g;
}

export const transferGroup: Handler = async (req, ctx, p) => {
  const g = await loadOwnerGroup(ctx, p.id);
  if (g instanceof Response) return g;
  const body = await readBody(req);
  const to = str(body?.toUserId);
  if ((await memberRole(ctx, p.id, to)) !== 'staff') return fail(400, 'TARGET_NOT_STAFF', '운영진 중에서 골라 주세요');
  const expires = new Date(Date.parse(ctx.now) + 7 * DAY_MS).toISOString();
  await ctx.db.run('UPDATE groups SET transfer_to = ?, transfer_expires = ? WHERE id = ?', to, expires, p.id);
  await notify(ctx.db, to, 'transfer_request', `「${g.name}」 모임장을 넘겨받아 달라는 요청이 왔어요`, `/groups/${g.id}`, `transfer_request:${g.id}:${to}:${expires}`, ctx.simDate);
  return json({ toUserId: to, expiresAt: expires }, 201);
};

export const acceptTransfer: Handler = async (_req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const g = await getGroup(ctx, p.id);
  if (!g || closedGone(ctx, g)) return NOT_FOUND();
  if (!g.transfer_to || g.transfer_to !== uid) return fail(403, 'NOT_TRANSFER_TARGET', '넘겨받을 사람만 수락할 수 있어요');
  if (g.closed_at) return fail(409, 'GROUP_CLOSED', '닫힌 모임이에요');
  if (!g.transfer_expires || g.transfer_expires < ctx.now) return fail(409, 'TRANSFER_EXPIRED', '요청이 만료됐어요');
  const tr = await memberRole(ctx, g.id, uid);
  if (tr !== 'staff' && tr !== 'member') {
    await ctx.db.run('UPDATE groups SET transfer_to = NULL, transfer_expires = NULL WHERE id = ?', g.id);
    return fail(409, 'TRANSFER_INVALID', '넘겨받을 수 없는 상태예요');
  }
  await ctx.db.batch([
    ["UPDATE group_members SET role = 'staff' WHERE group_id = ? AND role = 'owner'", [g.id]],
    ["UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?", [g.id, uid]],
    ['UPDATE groups SET transfer_to = NULL, transfer_expires = NULL, created_by = ? WHERE id = ?', [uid, g.id]],
  ]);
  return json({ ok: true });
};

export const closeGroup: Handler = async (req, ctx, p) => {
  const g = await loadOwnerGroup(ctx, p.id);
  if (g instanceof Response) return g;
  const body = await readBody(req);
  if (str(body?.confirmName) !== g.name) return fail(400, 'NAME_MISMATCH', '모임 이름이 맞지 않아요');
  const active = await campaignBadge(ctx, g.id, true);
  if (active) return fail(409, 'HAS_ACTIVE_CAMPAIGN', `「${active.title}」 캠페인이 있어서 닫을 수 없어요`);
  await ctx.db.run('UPDATE groups SET closed_at = ? WHERE id = ?', ctx.now, g.id);
  return json({ ok: true, closedAt: ctx.now });
};
