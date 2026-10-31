import type { HHMM, ISODate, Role } from '@shared/types';

export interface Db {
  all<T>(sql: string, ...p: unknown[]): Promise<T[]>;
  first<T>(sql: string, ...p: unknown[]): Promise<T | null>;
  run(sql: string, ...p: unknown[]): Promise<{ changes: number; lastId: number }>;
  batch(stmts: Array<[string, unknown[]]>): Promise<void>;
}

export interface Ctx {
  db: Db;
  userId: string | null;
  role: Role;
  simDate: ISODate;
  simTime: HHMM;
  staffGroupId: string | null;
  now: string;
  /** HMAC secret (TOKEN_SECRET) for server-derived codes such as attendance. */
  secret: string;
}

export type Handler = (req: Request, ctx: Ctx, params: Record<string, string>) => Promise<Response>;

export interface Env {
  DB: D1Database;
  SIM_PASSCODE: string;
  TOKEN_SECRET: string;
}

export function d1Db(d1: D1Database): Db {
  const bind = (sql: string, p: unknown[]) => d1.prepare(sql).bind(...p);
  return {
    async all<T>(sql: string, ...p: unknown[]) {
      const r = await bind(sql, p).all<T>();
      return r.results;
    },
    async first<T>(sql: string, ...p: unknown[]) {
      return (await bind(sql, p).first<T>()) ?? null;
    },
    async run(sql: string, ...p: unknown[]) {
      const r = await bind(sql, p).run();
      return { changes: r.meta.changes ?? 0, lastId: r.meta.last_row_id ?? 0 };
    },
    async batch(stmts) {
      if (stmts.length === 0) return;
      await d1.batch(stmts.map(([sql, p]) => bind(sql, p)));
    },
  };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}
