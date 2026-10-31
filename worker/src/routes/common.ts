import { fail, type Ctx } from '../db';

export const PAGE_SIZE = 20;

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export const likeEscape = (q: string) => `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

/** Offset-based cursor; items must be fetched with LIMIT PAGE_SIZE + 1. */
export function parseCursor(req: Request): number {
  const n = Number(new URL(req.url).searchParams.get('cursor') ?? 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function page<T>(rows: T[], offset: number): { items: T[]; nextCursor: string | null } {
  const more = rows.length > PAGE_SIZE;
  return { items: more ? rows.slice(0, PAGE_SIZE) : rows, nextCursor: more ? String(offset + PAGE_SIZE) : null };
}

export function requireUser(ctx: Ctx): string | Response {
  return ctx.userId ?? fail(401, 'NO_USER', '활동명으로 로그인해 주세요');
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns a 403 Response unless the caller is the simulated admin. */
export function requireAdmin(ctx: Ctx): Response | null {
  return ctx.role === 'admin' ? null : fail(403, 'ADMIN_ONLY', '관리자만 할 수 있어요');
}
