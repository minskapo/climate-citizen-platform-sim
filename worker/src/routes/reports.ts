import { nanoid } from 'nanoid';
import { fail, json, type Handler } from '../db';
import { readBody, requireUser, str } from './common';

const TABLES: Record<string, string> = { post: 'posts', comment: 'comments', group: 'groups' };

export const createReport: Handler = async (req, ctx) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const body = await readBody(req);
  if (!body) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const type = str(body.targetType);
  const targetId = str(body.targetId);
  const reason = str(body.reason);
  if (!TABLES[type]) return fail(400, 'BAD_TARGET', '신고할 수 없는 대상이에요');
  if (!reason || [...reason].length > 500) return fail(400, 'BAD_REASON', '신고 사유를 500자 이내로 써 주세요');
  if (!(await ctx.db.first(`SELECT id FROM ${TABLES[type]} WHERE id = ?`, targetId))) return fail(404, 'TARGET_NOT_FOUND', '신고 대상을 찾을 수 없어요');
  if (await ctx.db.first('SELECT id FROM reports WHERE target_type = ? AND target_id = ? AND reporter_id = ?', type, targetId, uid)) {
    return fail(409, 'ALREADY_REPORTED', '이미 신고했어요');
  }
  const id = nanoid();
  await ctx.db.run('INSERT INTO reports (id, created_at, target_type, target_id, reporter_id, reason, sim_date) VALUES (?,?,?,?,?,?,?)', id, ctx.now, type, targetId, uid, reason, ctx.simDate);
  return json({ id }, 201);
};
