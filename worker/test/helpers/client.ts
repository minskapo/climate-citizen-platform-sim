import { handle } from '../../src/index';
import { issueToken } from '../../src/auth';
import type { Db, Env } from '../../src/db';
import { sqliteDb, testEnv } from './sqliteDb';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestRes = Omit<Response, 'json'> & { json(): Promise<any> };

export interface Harness {
  db: Db;
  env: Env;
  call(method: string, path: string, opts?: { body?: unknown; headers?: Record<string, string>; token?: string | null }): Promise<TestRes>;
}

export function harness(): Harness {
  const db = sqliteDb();
  const env = testEnv;
  return {
    db,
    env,
    async call(method, path, opts = {}) {
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      const token = opts.token === undefined ? await issueToken(env.TOKEN_SECRET, Date.now()) : opts.token;
      if (token) headers['X-Sim-Token'] = token;
      if (opts.body !== undefined) headers['content-type'] = 'application/json';
      const req = new Request('https://x.test' + path, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
      return (await handle(req, env, db)) as TestRes;
    },
  };
}
