import { nanoid } from 'nanoid';
import { addDays } from '@shared/date';
import { checkFileSize } from '@shared/validate';
import { fail, json, type Ctx, type Handler } from '../db';
import { closedGone, getGroup, isMemberRole, isStaffRole, memberRole, type GroupRow } from './groups';
import { likeEscape, page, PAGE_SIZE, parseCursor, readBody, requireUser, str } from './common';

interface PostRow {
  id: string;
  created_at: string;
  board_type: 'group' | 'campaign';
  board_id: string;
  category: string;
  title: string;
  body: string;
  author_id: string;
  pinned: number;
  hidden: number;
  attachments_json: string;
  sim_date: string | null;
  view_count: number;
}

interface Board {
  type: 'group' | 'campaign';
  id: string;
  groupId: string | null; // owning/host group
  staff: boolean;
  canRead: boolean;
  canWrite: boolean;
  closed: boolean;
  categories: string[] | null;
}

const admin = (ctx: Ctx) => ctx.role === 'admin';

/** Resolves access to a board. Returns a 404 Response if the board does not exist / is gone. */
export async function loadBoard(ctx: Ctx, type: string, id: string): Promise<Board | Response> {
  if (type === 'group') {
    const g: GroupRow | null = await getGroup(ctx, id);
    if (!g || closedGone(ctx, g)) return fail(404, 'BOARD_NOT_FOUND', '게시판을 찾을 수 없어요');
    const role = await memberRole(ctx, id, ctx.userId);
    const staff = isStaffRole(ctx, id, role) || admin(ctx);
    const member = isMemberRole(role) || staff;
    return {
      type, id, groupId: id, staff, closed: !!g.closed_at,
      canRead: g.join_policy !== 'private' || member,
      canWrite: member && !g.closed_at,
      categories: JSON.parse(g.categories_json),
    };
  }
  if (type === 'campaign') {
    const c = await ctx.db.first<{ host_group_id: string | null }>('SELECT host_group_id FROM campaigns WHERE id = ?', id);
    if (!c) return fail(404, 'BOARD_NOT_FOUND', '게시판을 찾을 수 없어요');
    const role = c.host_group_id ? await memberRole(ctx, c.host_group_id, ctx.userId) : null;
    const staff = (!!c.host_group_id && isStaffRole(ctx, c.host_group_id, role)) || admin(ctx);
    const part = ctx.userId
      ? await ctx.db.first('SELECT id FROM participations WHERE campaign_id = ? AND user_id = ?', id, ctx.userId)
      : null;
    const ok = staff || !!part;
    return { type, id, groupId: c.host_group_id, staff, canRead: ok, canWrite: ok, closed: false, categories: null };
  }
  return fail(404, 'BOARD_NOT_FOUND', '게시판을 찾을 수 없어요');
}

const forbidRead = () => fail(403, 'FORBIDDEN', '볼 수 있는 권한이 없어요');

/** Whether the viewer may see this (possibly hidden) post. */
const canSee = (ctx: Ctx, b: Board, p: PostRow) => !p.hidden || b.staff || p.author_id === ctx.userId;

async function names(ctx: Ctx, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return new Map();
  const rows = await ctx.db.all<{ id: string; nickname: string }>(`SELECT id, nickname FROM users WHERE id IN (${uniq.map(() => '?').join(',')})`, ...uniq);
  return new Map(rows.map((r) => [r.id, r.nickname]));
}

const counts = async (ctx: Ctx, postId: string) => ({
  commentCount: (await ctx.db.first<{ n: number }>('SELECT COUNT(*) n FROM comments WHERE post_id = ? AND hidden = 0', postId))?.n ?? 0,
  likeCount: (await ctx.db.first<{ n: number }>("SELECT COUNT(*) n FROM reactions WHERE target_type = 'post' AND target_id = ? AND kind = 'like'", postId))?.n ?? 0,
});

const summary = (p: PostRow, nick: Map<string, string>, c: { commentCount: number; likeCount: number }) => ({
  id: p.id, boardType: p.board_type, boardId: p.board_id, category: p.category, title: p.title,
  excerpt: p.body.slice(0, 120), authorId: p.author_id, author: nick.get(p.author_id) ?? '',
  pinned: !!p.pinned, hidden: !!p.hidden, createdAt: p.created_at, simDate: p.sim_date,
  viewCount: p.view_count, ...c, attachmentCount: (JSON.parse(p.attachments_json) as unknown[]).length,
});

export const listPosts: Handler = async (req, ctx, p) => {
  const b = await loadBoard(ctx, p.type, p.id);
  if (b instanceof Response) return b;
  if (!b.canRead) return forbidRead();
  const sp = new URL(req.url).searchParams;
  const where = ['board_type = ?', 'board_id = ?'];
  const args: unknown[] = [b.type, b.id];
  if (!b.staff) {
    where.push('(hidden = 0 OR author_id = ?)');
    args.push(ctx.userId ?? '');
  }
  if (sp.get('category')) { where.push('category = ?'); args.push(sp.get('category')); }
  const q = (sp.get('q') ?? '').trim();
  if (q) { where.push("(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')"); args.push(likeEscape(q), likeEscape(q)); }
  const offset = parseCursor(req);
  const rows = await ctx.db.all<PostRow>(
    `SELECT * FROM posts WHERE ${where.join(' AND ')} ORDER BY pinned DESC, created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ...args, PAGE_SIZE + 1, offset,
  );
  const shown = rows.slice(0, PAGE_SIZE);
  const nick = await names(ctx, shown.map((r) => r.author_id));
  const items = await Promise.all(shown.map(async (r) => summary(r, nick, await counts(ctx, r.id))));
  return json({ items, nextCursor: rows.length > PAGE_SIZE ? String(offset + PAGE_SIZE) : null });
};

function decodeBase64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export const createPost: Handler = async (req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const b = await loadBoard(ctx, p.type, p.id);
  if (b instanceof Response) return b;
  if (!b.canRead) return forbidRead();
  if (!b.canWrite) return fail(b.closed ? 409 : 403, b.closed ? 'GROUP_CLOSED' : 'NOT_MEMBER', b.closed ? '닫힌 모임이에요' : '멤버만 글을 쓸 수 있어요');
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const category = str(body.category) || (b.categories ? '자유' : '');
  const title = str(body.title);
  const text = typeof body.body === 'string' ? body.body : '';
  if (!title || [...title].length > 100) return fail(400, 'BAD_TITLE', '제목은 1~100자로 써 주세요');
  if (!text.trim() || text.length > 10000) return fail(400, 'BAD_BODY', '내용은 1~10000자로 써 주세요');
  if (b.categories && !b.categories.includes(category)) return fail(400, 'BAD_CATEGORY', '게시판 분류가 올바르지 않아요');
  if (category === '공지' && !b.staff) return fail(403, 'NOTICE_STAFF_ONLY', '공지는 운영진만 쓸 수 있어요');

  const raw = Array.isArray(body.attachments) ? body.attachments : [];
  if (raw.length > 5) return fail(400, 'TOO_MANY_FILES', '첨부는 5개까지 올릴 수 있어요');
  const postId = nanoid();
  const files: Array<{ id: string; name: string; mime: string; bytes: number; data: Uint8Array }> = [];
  for (const a of raw as Array<Record<string, unknown>>) {
    const data = typeof a?.dataBase64 === 'string' ? decodeBase64(a.dataBase64) : null;
    if (!data) return fail(400, 'BAD_ATTACHMENT', '첨부 파일을 읽을 수 없어요');
    if (!checkFileSize(data.byteLength)) return fail(413, 'FILE_TOO_LARGE', '파일은 1MB 이하만 올릴 수 있어요');
    files.push({ id: nanoid(), name: str(a.name).slice(0, 100) || 'file', mime: str(a.mime) || 'application/octet-stream', bytes: data.byteLength, data });
  }
  const meta = files.map(({ id, name, mime, bytes }) => ({ id, name, mime, bytes }));
  await ctx.db.batch([
    [
      'INSERT INTO posts (id, created_at, board_type, board_id, category, title, body, author_id, attachments_json, sim_date) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [postId, ctx.now, b.type, b.id, category, title, text, uid, JSON.stringify(meta), ctx.simDate],
    ],
    ...files.map((f): [string, unknown[]] => [
      'INSERT INTO files (id, created_at, mime, bytes, data, owner_id, sim_date, post_id) VALUES (?,?,?,?,?,?,?,?)',
      [f.id, ctx.now, f.mime, f.bytes, f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength), uid, ctx.simDate, postId],
    ]),
  ]);
  const row = (await ctx.db.first<PostRow>('SELECT * FROM posts WHERE id = ?', postId))!;
  return json(summary(row, await names(ctx, [uid]), { commentCount: 0, likeCount: 0 }), 201);
};

async function loadPost(ctx: Ctx, id: string): Promise<{ post: PostRow; board: Board } | Response> {
  const post = await ctx.db.first<PostRow>('SELECT * FROM posts WHERE id = ?', id);
  if (!post) return fail(404, 'POST_NOT_FOUND', '글을 찾을 수 없어요');
  const board = await loadBoard(ctx, post.board_type, post.board_id);
  if (board instanceof Response) return board;
  if (!board.canRead) return forbidRead();
  if (!canSee(ctx, board, post)) return fail(404, 'POST_NOT_FOUND', '글을 찾을 수 없어요');
  return { post, board };
}

export const getPost: Handler = async (_req, ctx, p) => {
  const r = await loadPost(ctx, p.id);
  if (r instanceof Response) return r;
  const { post, board } = r;
  await ctx.db.run('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', post.id);
  const comments = await ctx.db.all<{ id: string; author_id: string; body: string; created_at: string; hidden: number }>(
    `SELECT id, author_id, body, created_at, hidden FROM comments WHERE post_id = ? ${board.staff ? '' : 'AND hidden = 0'} ORDER BY created_at, id`,
    post.id,
  );
  const nick = await names(ctx, [post.author_id, ...comments.map((c) => c.author_id)]);
  const mine = ctx.userId
    ? await ctx.db.first("SELECT id FROM reactions WHERE target_type = 'post' AND target_id = ? AND user_id = ? AND kind = 'like'", post.id, ctx.userId)
    : null;
  return json({
    ...summary({ ...post, view_count: post.view_count + 1 }, nick, await counts(ctx, post.id)),
    body: post.body,
    attachments: JSON.parse(post.attachments_json),
    liked: !!mine,
    canManage: board.staff,
    comments: comments.map((c) => ({ id: c.id, authorId: c.author_id, author: nick.get(c.author_id) ?? '', body: c.body, createdAt: c.created_at, hidden: !!c.hidden })),
  });
};

export const patchPost: Handler = async (req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const r = await loadPost(ctx, p.id);
  if (r instanceof Response) return r;
  const { post, board } = r;
  if (post.author_id !== uid) return fail(403, 'NOT_AUTHOR', '쓴 사람만 고칠 수 있어요');
  if (board.closed) return fail(409, 'GROUP_CLOSED', '닫힌 모임이에요');
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const title = body.title !== undefined ? str(body.title) : post.title;
  const text = body.body !== undefined ? (typeof body.body === 'string' ? body.body : '') : post.body;
  const category = body.category !== undefined ? str(body.category) : post.category;
  if (!title || [...title].length > 100) return fail(400, 'BAD_TITLE', '제목은 1~100자로 써 주세요');
  if (!text.trim() || text.length > 10000) return fail(400, 'BAD_BODY', '내용은 1~10000자로 써 주세요');
  if (board.categories && !board.categories.includes(category)) return fail(400, 'BAD_CATEGORY', '게시판 분류가 올바르지 않아요');
  if (category === '공지' && category !== post.category && !board.staff) return fail(403, 'NOTICE_STAFF_ONLY', '공지는 운영진만 쓸 수 있어요');
  await ctx.db.run('UPDATE posts SET title = ?, body = ?, category = ? WHERE id = ?', title, text, category, post.id);
  const row = (await ctx.db.first<PostRow>('SELECT * FROM posts WHERE id = ?', post.id))!;
  return json(summary(row, await names(ctx, [row.author_id]), await counts(ctx, post.id)));
};

export const deletePost: Handler = async (_req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const r = await loadPost(ctx, p.id);
  if (r instanceof Response) return r;
  const { post, board } = r;
  if (post.author_id !== uid && !board.staff) return fail(403, 'FORBIDDEN', '지울 수 있는 권한이 없어요');
  if (board.closed) return fail(409, 'GROUP_CLOSED', '닫힌 모임이에요');
  await ctx.db.batch([
    ['DELETE FROM files WHERE post_id = ?', [post.id]],
    ['DELETE FROM comments WHERE post_id = ?', [post.id]],
    ["DELETE FROM reactions WHERE target_type = 'post' AND target_id = ?", [post.id]],
    ['DELETE FROM posts WHERE id = ?', [post.id]],
  ]);
  return json({ ok: true });
};

function staffFlag(column: 'pinned' | 'hidden', value: 0 | 1): Handler {
  return async (_req, ctx, p) => {
    const uid = requireUser(ctx);
    if (uid instanceof Response) return uid;
    // Staff must be able to reach hidden posts, so load via the post then check staff.
    const post = await ctx.db.first<PostRow>('SELECT * FROM posts WHERE id = ?', p.id);
    if (!post) return fail(404, 'POST_NOT_FOUND', '글을 찾을 수 없어요');
    const board = await loadBoard(ctx, post.board_type, post.board_id);
    if (board instanceof Response) return board;
    if (!board.staff) return fail(403, 'NOT_STAFF', '운영진만 할 수 있어요');
    if (board.closed) return fail(409, 'GROUP_CLOSED', '닫힌 모임이에요');
    await ctx.db.run(`UPDATE posts SET ${column} = ? WHERE id = ?`, value, post.id);
    return json({ ok: true, [column]: !!value });
  };
}
export const pinPost = staffFlag('pinned', 1);
export const unpinPost = staffFlag('pinned', 0);
export const hidePost = staffFlag('hidden', 1);
export const unhidePost = staffFlag('hidden', 0);

export const likePost: Handler = async (_req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const r = await loadPost(ctx, p.id);
  if (r instanceof Response) return r;
  const had = await ctx.db.first("SELECT id FROM reactions WHERE target_type = 'post' AND target_id = ? AND user_id = ? AND kind = 'like'", p.id, uid);
  if (had) await ctx.db.run("DELETE FROM reactions WHERE target_type = 'post' AND target_id = ? AND user_id = ? AND kind = 'like'", p.id, uid);
  else await ctx.db.run("INSERT INTO reactions (id, created_at, target_type, target_id, user_id, kind, sim_date) VALUES (?,?,'post',?,?,'like',?)", nanoid(), ctx.now, p.id, uid, ctx.simDate);
  return json({ liked: !had, likeCount: (await counts(ctx, p.id)).likeCount });
};

export const addComment: Handler = async (req, ctx, p) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const r = await loadPost(ctx, p.id);
  if (r instanceof Response) return r;
  if (!r.board.canWrite) return fail(r.board.closed ? 409 : 403, r.board.closed ? 'GROUP_CLOSED' : 'NOT_MEMBER', r.board.closed ? '닫힌 모임이에요' : '멤버만 댓글을 쓸 수 있어요');
  if (r.post.hidden) return fail(409, 'POST_HIDDEN', '숨겨진 글에는 댓글을 쓸 수 없어요');
  const body = await readBody(req);
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!text || text.length > 1000) return fail(400, 'BAD_BODY', '댓글은 1~1000자로 써 주세요');
  const id = nanoid();
  await ctx.db.run('INSERT INTO comments (id, created_at, post_id, author_id, body, sim_date) VALUES (?,?,?,?,?,?)', id, ctx.now, p.id, uid, text, ctx.simDate);
  return json({ id, postId: p.id, authorId: uid, body: text, createdAt: ctx.now }, 201);
};

export const popular: Handler = async (req, ctx) => {
  const sp = new URL(req.url).searchParams;
  const days = Math.min(Math.max(Number(sp.get('days') ?? 7) || 7, 1), 90);
  const limit = Math.min(Math.max(Number(sp.get('limit') ?? 6) || 6, 1), 20);
  const from = addDays(ctx.simDate, -days);
  const rows = await ctx.db.all<PostRow & { group_name: string; comment_count: number; like_count: number; score: number }>(
    `SELECT p.*, g.name AS group_name,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.hidden = 0) AS comment_count,
            (SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'post' AND r.target_id = p.id AND r.kind = 'like') AS like_count,
            p.view_count + 3 * (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.hidden = 0) AS score
       FROM posts p JOIN groups g ON g.id = p.board_id
      WHERE p.board_type = 'group' AND g.join_policy <> 'private' AND g.closed_at IS NULL
        AND p.hidden = 0 AND p.sim_date > ? AND p.sim_date <= ?
      ORDER BY score DESC, p.created_at DESC, p.id DESC LIMIT ?`,
    from, ctx.simDate, limit,
  );
  const nick = await names(ctx, rows.map((r) => r.author_id));
  return json({
    items: rows.map((r) => ({ ...summary(r, nick, { commentCount: r.comment_count, likeCount: r.like_count }), groupName: r.group_name, score: r.score })),
    nextCursor: null,
  });
};
