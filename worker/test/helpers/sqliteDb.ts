import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Db, Env } from '../../src/db';

const MIGRATIONS = fileURLToPath(new URL('../../migrations', import.meta.url).href);

/** In-memory SQLite implementing the same Db interface, with all migrations applied. */
export function sqliteDb(): Db {
  const sqlite = new Database(':memory:');
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  const norm = (p: unknown[]) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
  return {
    async all<T>(sql: string, ...p: unknown[]) {
      return sqlite.prepare(sql).all(...norm(p)) as T[];
    },
    async first<T>(sql: string, ...p: unknown[]) {
      return (sqlite.prepare(sql).get(...norm(p)) as T | undefined) ?? null;
    },
    async run(sql: string, ...p: unknown[]) {
      const r = sqlite.prepare(sql).run(...norm(p));
      return { changes: r.changes, lastId: Number(r.lastInsertRowid) };
    },
    async batch(stmts) {
      sqlite.transaction(() => {
        for (const [sql, p] of stmts) sqlite.prepare(sql).run(...norm(p));
      })();
    },
  };
}

/** Fake bindings for tests; the passcode here is test-only. */
export const testEnv = { SIM_PASSCODE: 'test-pass', TOKEN_SECRET: 'test-secret-0123456789' } as unknown as Env;
