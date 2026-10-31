import { nanoid } from 'nanoid';
import { normalizeNickname } from '@shared/validate';
import { fail, json, type Ctx, type Handler } from '../db';

interface UserRow {
  id: string;
  created_at: string;
  nickname: string;
  sido: string;
  sigungu: string;
  consents_json: string;
  settings_json: string;
}

export interface User {
  id: string;
  nickname: string;
  sido: string;
  sigungu: string;
  consents: Record<string, unknown>;
  settings: Record<string, unknown>;
  createdAt: string;
}

function toUser(r: UserRow): User {
  return {
    id: r.id,
    nickname: r.nickname,
    sido: r.sido,
    sigungu: r.sigungu,
    consents: JSON.parse(r.consents_json),
    settings: JSON.parse(r.settings_json),
    createdAt: r.created_at,
  };
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const createUser: Handler = async (req, ctx) => {
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const nick = normalizeNickname(typeof body.nickname === 'string' ? body.nickname : '');
  if (!nick.ok) return fail(400, 'BAD_NICKNAME', nick.error);
  const dup = await ctx.db.first('SELECT id FROM users WHERE nickname = ?', nick.value);
  if (dup) return fail(409, 'NICKNAME_TAKEN', '이미 쓰고 있는 활동명이에요');
  const id = nanoid();
  try {
    await ctx.db.run(
      'INSERT INTO users (id, created_at, nickname, sido, sigungu, consents_json, sim_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, ctx.now, nick.value, str(body.sido), str(body.sigungu), JSON.stringify(obj(body.consents)), ctx.simDate,
    );
  } catch {
    return fail(409, 'NICKNAME_TAKEN', '이미 쓰고 있는 활동명이에요');
  }
  const row = await ctx.db.first<UserRow>('SELECT * FROM users WHERE id = ?', id);
  return json(toUser(row!), 201);
};

export const listUsers: Handler = async (req, ctx) => {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  const rows = await ctx.db.all<UserRow>(
    "SELECT * FROM users WHERE nickname LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 50",
    like,
  );
  return json(rows.map((r) => ({ id: r.id, nickname: r.nickname, sido: r.sido, sigungu: r.sigungu })));
};

async function currentUser(ctx: Ctx): Promise<UserRow | Response> {
  if (!ctx.userId) return fail(401, 'NO_USER', '활동명으로 로그인해 주세요');
  const row = await ctx.db.first<UserRow>('SELECT * FROM users WHERE id = ?', ctx.userId);
  return row ?? fail(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없어요');
}

export const getMe: Handler = async (_req, ctx) => {
  const row = await currentUser(ctx);
  return row instanceof Response ? row : json(toUser(row));
};

export const patchMe: Handler = async (req, ctx) => {
  const row = await currentUser(ctx);
  if (row instanceof Response) return row;
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  let nickname = row.nickname;
  if (body.nickname !== undefined) {
    const nick = normalizeNickname(typeof body.nickname === 'string' ? body.nickname : '');
    if (!nick.ok) return fail(400, 'BAD_NICKNAME', nick.error);
    nickname = nick.value;
    const dup = await ctx.db.first('SELECT id FROM users WHERE nickname = ? AND id <> ?', nickname, row.id);
    if (dup) return fail(409, 'NICKNAME_TAKEN', '이미 쓰고 있는 활동명이에요');
  }
  const sido = body.sido !== undefined ? str(body.sido) : row.sido;
  const sigungu = body.sigungu !== undefined ? str(body.sigungu) : row.sigungu;
  const consents = body.consents !== undefined ? JSON.stringify(obj(body.consents)) : row.consents_json;
  const settings = body.settings !== undefined ? JSON.stringify(obj(body.settings)) : row.settings_json;
  await ctx.db.run(
    'UPDATE users SET nickname = ?, sido = ?, sigungu = ?, consents_json = ?, settings_json = ? WHERE id = ?',
    nickname, sido, sigungu, consents, settings, row.id,
  );
  const next = await ctx.db.first<UserRow>('SELECT * FROM users WHERE id = ?', row.id);
  return json(toUser(next!));
};
