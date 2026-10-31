import { safeEqual } from '../auth';
import { enterFailCount, enterFailKey, MAX_ENTER_FAILS, recordEnterFail } from '../cap';
import { fail, json, type Ctx, type Handler } from '../db';
import { audit } from './admin';
import { readBody, requireAdmin } from './common';

const KEEP = new Set(['request_counts', 'd1_migrations']);

async function tableNames(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name");
  return rows.map((r) => r.name);
}

/** 체험 데이터 내보내기: every table as JSON; file bytes are left out (size only). */
export const simExport: Handler = async (_req, ctx) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const tables: Record<string, unknown[]> = {};
  for (const t of await tableNames(ctx)) {
    if (KEEP.has(t) && t !== 'request_counts') continue;
    tables[t] = t === 'files'
      ? await ctx.db.all('SELECT id, created_at, mime, bytes, owner_id, sim_date, post_id, record_id FROM files')
      : await ctx.db.all(`SELECT * FROM ${t}`);
  }
  return json({ exportedAt: ctx.now, tables });
};

/** 체험 데이터 초기화: admin + passcode; clears every table except request_counts, then logs it. */
export const simReset: Handler = async (req, ctx) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const key = enterFailKey(`reset:${ctx.userId ?? 'anon'}`);
  if ((await enterFailCount(ctx.db, key)) >= MAX_ENTER_FAILS) return fail(429, 'TOO_MANY_ATTEMPTS', '시도 횟수가 너무 많아요. 잠시 후 다시 해 주세요');
  const b = await readBody(req);
  const passcode = typeof b?.passcode === 'string' ? b.passcode : '';
  if (!ctx.simPasscode || !safeEqual(passcode, ctx.simPasscode)) {
    await recordEnterFail(ctx.db, key);
    return fail(401, 'BAD_PASSCODE', '입장 코드가 맞지 않아요');
  }
  const names = (await tableNames(ctx)).filter((t) => !KEEP.has(t));
  await ctx.db.batch(names.map((t): [string, unknown[]] => [`DELETE FROM ${t}`, []]));
  await audit(ctx, 'sim_reset', null, null, { tables: names.length });
  return json({ ok: true, cleared: names.length });
};
