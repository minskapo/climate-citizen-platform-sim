import { nanoid } from 'nanoid';
import { fail, json, type Handler } from '../db';
import { notify } from '../notify';
import { createDraft } from './campaigns';
import { addDays } from '@shared/date';
import { readBody, requireAdmin, requireUser, str } from './common';
import { isStaffRole, memberRole } from './groups';

const len = (s: string) => [...s].length;

/** 협업 제안 보내기: due_at is the proposer's sim date/time + 24h ("YYYY-MM-DDTHH:MM", sim wall clock). */
export const createCollab: Handler = async (req, ctx) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const b = await readBody(req);
  if (!b) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const title = str(b.title), idea = str(b.idea), period = str(b.period), size = str(b.size);
  if (!title || len(title) > 60) return fail(400, 'BAD_TITLE', '제안 이름을 60자 이내로 써 주세요');
  if (!idea || len(idea) > 2000) return fail(400, 'BAD_IDEA', '제안 내용을 2000자 이내로 써 주세요');
  if (len(period) > 100 || len(size) > 100) return fail(400, 'BAD_FIELD', '기간과 규모는 100자 이내로 써 주세요');
  let groupId: string | null = null;
  if (b.groupId !== undefined && b.groupId !== null && b.groupId !== '') {
    groupId = str(b.groupId);
    const g = await ctx.db.first('SELECT id FROM groups WHERE id = ?', groupId);
    if (!g) return fail(404, 'GROUP_NOT_FOUND', '모임을 찾을 수 없어요');
    if (!isStaffRole(ctx, groupId, await memberRole(ctx, groupId, uid))) return fail(403, 'NOT_STAFF', '모임 운영진만 모임 이름으로 제안할 수 있어요');
  }
  const id = nanoid();
  const dueAt = `${addDays(ctx.simDate, 1)}T${ctx.simTime}`;
  await ctx.db.run(
    'INSERT INTO collab_proposals (id, created_at, from_group_id, body, status, due_at, sim_date, title, period, size, author_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id, ctx.now, groupId, idea, 'open', dueAt, ctx.simDate, title, period, size, uid,
  );
  return json({ id, dueAt, status: 'open' }, 201);
};

interface CollabRow { id: string; created_at: string; sim_date: string | null; from_group_id: string | null; campaign_id: string | null; body: string; status: string; due_at: string | null; title: string; period: string; size: string; author_id: string | null }

export const listCollab: Handler = async (_req, ctx) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const rows = await ctx.db.all<CollabRow & { author: string | null; group_name: string | null }>(
    `SELECT c.*, u.nickname author, g.name group_name FROM collab_proposals c
     LEFT JOIN users u ON u.id = c.author_id LEFT JOIN groups g ON g.id = c.from_group_id
     ORDER BY (c.status = 'open') DESC, c.due_at, c.created_at DESC LIMIT 200`,
  );
  const replies = await ctx.db.all<{ id: string; proposal_id: string; body: string; created_at: string }>(
    'SELECT id, proposal_id, body, created_at FROM collab_replies ORDER BY created_at',
  );
  return json({
    items: rows.map((r) => ({
      id: r.id, title: r.title, idea: r.body, period: r.period, size: r.size, status: r.status, dueAt: r.due_at, createdAt: r.created_at, simDate: r.sim_date,
      author: r.author, groupId: r.from_group_id, groupName: r.group_name, campaignId: r.campaign_id,
      replies: replies.filter((x) => x.proposal_id === r.id).map((x) => ({ id: x.id, body: x.body, createdAt: x.created_at })),
    })),
  });
};

export const replyCollab: Handler = async (req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const c = await ctx.db.first<CollabRow>('SELECT * FROM collab_proposals WHERE id = ?', p.id);
  if (!c) return fail(404, 'COLLAB_NOT_FOUND', '협업 제안을 찾을 수 없어요');
  const body = str((await readBody(req))?.body);
  if (!body || len(body) > 2000) return fail(400, 'BAD_BODY', '답장을 2000자 이내로 써 주세요');
  const id = nanoid();
  await ctx.db.batch([
    ['INSERT INTO collab_replies (id, created_at, proposal_id, author_id, body, sim_date) VALUES (?,?,?,?,?,?)', [id, ctx.now, c.id, ctx.userId, body, ctx.simDate]],
    ["UPDATE collab_proposals SET status = 'replied' WHERE id = ? AND status = 'open'", [c.id]],
  ]);
  if (c.author_id) await notify(ctx.db, c.author_id, 'collab_reply', `「${c.title}」 협업 제안에 답장이 왔어요`, '/collab', `collab_reply:${id}`, ctx.simDate);
  return json({ id, status: 'replied' }, 201);
};

/** 캠페인 초안 만들기: a draft prefilled with the proposal and its host group. */
export const draftFromCollab: Handler = async (req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const c = await ctx.db.first<CollabRow>('SELECT * FROM collab_proposals WHERE id = ?', p.id);
  if (!c) return fail(404, 'COLLAB_NOT_FOUND', '협업 제안을 찾을 수 없어요');
  const b = (await readBody(req)) ?? {};
  const type = ['practice', 'signature', 'offline'].includes(b.type as string) ? b.type : 'practice';
  const group = c.from_group_id ? await ctx.db.first<{ closed_at: string | null }>('SELECT closed_at FROM groups WHERE id = ?', c.from_group_id) : null;
  const draft = await createDraft(ctx, {
    type, title: [...c.title].slice(0, 30).join(''), summary: [...c.body].slice(0, 80).join(''),
    hostGroupId: group && !group.closed_at ? c.from_group_id : null,
  });
  if (draft instanceof Response) return draft;
  await ctx.db.run("UPDATE collab_proposals SET campaign_id = ?, status = 'drafted' WHERE id = ?", draft, c.id);
  return json({ campaignId: draft }, 201);
};
