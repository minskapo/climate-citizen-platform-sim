import { nanoid } from 'nanoid';
import type { PracticeSettings } from '../campaignSettings';
import { fail, json, type Ctx, type Handler } from '../db';
import { notify } from '../notify';
import { scheduleOf, statusOf, type CampaignRow } from './campaigns';
import { DAY_MS, likeEscape, readBody, requireAdmin, str } from './common';
import { campaignBadge, getGroup } from './groups';
import { isStaffRole, memberRole } from './groups';
import { loadCampaignRow } from './participations';

const LIVE = ['recruiting', 'running'];
const day = (iso: string) => iso.slice(0, 10);

export async function audit(ctx: Ctx, action: string, targetType: string | null, targetId: string | null, detail: unknown = {}) {
  await ctx.db.run('INSERT INTO audit_log (id, created_at, user_id, action, target_type, target_id, detail_json, sim_date) VALUES (?,?,?,?,?,?,?,?)',
    nanoid(), ctx.now, ctx.userId, action, targetType, targetId, JSON.stringify(detail), ctx.simDate);
}

const count = async (ctx: Ctx, sql: string, ...p: unknown[]) => (await ctx.db.first<{ n: number }>(sql, ...p))?.n ?? 0;

export const adminHome: Handler = async (_req, ctx) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const weekAgo = new Date(Date.parse(ctx.now) - 7 * DAY_MS).toISOString();
  const campaigns = await ctx.db.all<CampaignRow>("SELECT * FROM campaigns WHERE publish <> 'draft'");
  const live = campaigns.filter((c) => LIVE.includes(statusOf(ctx, c)));
  const scheduled = campaigns.filter((c) => statusOf(ctx, c) === 'scheduled');
  const running = [];
  for (const c of live) {
    const applied = await count(ctx, "SELECT COUNT(*) n FROM participations WHERE campaign_id = ? AND state IN ('applied','signed','paused')", c.id);
    const recorders = await count(ctx,
      'SELECT COUNT(DISTINCT r.participation_id) n FROM records r JOIN participations p ON p.id = r.participation_id WHERE p.campaign_id = ? AND r.created_at >= ?', c.id, weekAgo);
    running.push({ id: c.id, title: c.title, type: c.type, status: statusOf(ctx, c), participants: applied, recentRecordRate: c.type === 'practice' && applied ? recorders / applied : null });
  }
  const days = Array.from({ length: 7 }, (_, i) => day(new Date(Date.parse(ctx.now) - (6 - i) * DAY_MS).toISOString()));
  const perDay = async (table: string) => {
    const rows = await ctx.db.all<{ d: string; n: number }>(`SELECT substr(created_at,1,10) d, COUNT(*) n FROM ${table} WHERE created_at >= ? GROUP BY d`, days[0]);
    return days.map((d) => rows.find((r) => r.d === d)?.n ?? 0);
  };
  return json({
    tasks: {
      openReports: await count(ctx, "SELECT COUNT(*) n FROM reports WHERE status = 'open'"),
      openCollab: await ctx.db.all<{ id: string; title: string; due_at: string | null }>("SELECT id, title, due_at FROM collab_proposals WHERE status = 'open' ORDER BY due_at LIMIT 20")
        .then((r) => r.map((x) => ({ id: x.id, title: x.title, dueAt: x.due_at }))),
      pendingTools: await count(ctx, "SELECT COUNT(DISTINCT tool_id) n FROM tool_versions WHERE status = 'pending'"),
      scheduledCampaigns: scheduled.map((c) => ({ id: c.id, title: c.title, recruitStart: scheduleOf(c).recruitStart })),
    },
    status: {
      users: await count(ctx, 'SELECT COUNT(*) n FROM users'),
      openCampaigns: live.length,
      groups: await count(ctx, 'SELECT COUNT(*) n FROM groups WHERE closed_at IS NULL'),
      postsThisWeek: await count(ctx, 'SELECT COUNT(*) n FROM posts WHERE created_at >= ?', weekAgo),
      measurements: await count(ctx, 'SELECT COUNT(*) n FROM measurements'),
    },
    campaigns: running,
    last7: { days, users: await perDay('users'), posts: await perDay('posts'), participations: await perDay('participations'), records: await perDay('records') },
  });
};

// ---- participants ------------------------------------------------------------

interface PartRow {
  id: string; user_id: string; state: string; sim_date: string | null; created_at: string; companions: number; consents_json: string; answers_json: string;
  checklist_json: string; start_measurement_id: string | null; nickname: string; sido: string; sigungu: string; user_consents: string; restricted: number;
}

export async function partRows(ctx: Ctx, campaignId: string) {
  const rows = await ctx.db.all<PartRow>(
    `SELECT p.id, p.user_id, p.state, p.sim_date, p.created_at, p.companions, p.consents_json, p.answers_json, p.checklist_json, p.start_measurement_id,
            u.nickname, u.sido, u.sigungu, u.consents_json user_consents, u.restricted
     FROM participations p JOIN users u ON u.id = p.user_id WHERE p.campaign_id = ? ORDER BY p.created_at, p.rowid`, campaignId);
  const recs = new Map((await ctx.db.all<{ pid: string; n: number }>(
    'SELECT r.participation_id pid, COUNT(*) n FROM records r JOIN participations p ON p.id = r.participation_id WHERE p.campaign_id = ? GROUP BY pid', campaignId)).map((x) => [x.pid, x.n]));
  const total = async (sql: string, ...p: unknown[]) => {
    const rs = await ctx.db.all<{ k: string; result_json: string }>(sql, ...p);
    return new Map(rs.map((r) => [r.k, (JSON.parse(r.result_json) as { total?: number }).total ?? null]));
  };
  const start = await total(
    'SELECT p.id k, m.result_json FROM participations p JOIN measurements m ON m.id = p.start_measurement_id WHERE p.campaign_id = ?', campaignId);
  const end = await total(
    `SELECT p.id k, m.result_json FROM participations p JOIN measurements m ON m.rowid = (
       SELECT m2.rowid FROM measurements m2 WHERE m2.user_id = p.user_id AND m2.campaign_id = p.campaign_id AND m2.kind = 'end' ORDER BY m2.created_at DESC, m2.rowid DESC LIMIT 1)
     WHERE p.campaign_id = ?`, campaignId);
  return rows.map((r) => {
    const answers = JSON.parse(r.answers_json) as { reminder?: { enabled?: boolean } };
    const checklist = Object.values(JSON.parse(r.checklist_json) as Record<string, boolean>).filter(Boolean).length;
    const research = (JSON.parse(r.consents_json) as { research?: boolean }).research === true || (JSON.parse(r.user_consents) as { research?: boolean }).research === true;
    return {
      id: r.id, userId: r.user_id, nickname: r.nickname, region: r.sido || '', state: r.state, appliedOn: r.sim_date ?? day(r.created_at), companions: r.companions,
      startTotal: start.get(r.id) ?? null, endTotal: end.get(r.id) ?? null, recordCount: recs.get(r.id) ?? 0,
      reminderOn: answers.reminder?.enabled !== false, checklistDone: checklist, research,
    };
  });
}

export const adminParticipants: Handler = async (req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const c = await loadCampaignRow(ctx, p.id);
  if (!c) return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
  const sp = new URL(req.url).searchParams;
  const filter = sp.get('filter') ?? '', q = (sp.get('q') ?? '').trim().toLowerCase();
  const all = await partRows(ctx, c.id);
  const live = all.filter((r) => r.state !== 'cancelled');
  const filters: Record<string, (r: (typeof all)[number]) => boolean> = {
    no_start: (r) => r.startTotal === null && r.state !== 'cancelled',
    reminder_off: (r) => !r.reminderOn && r.state !== 'cancelled',
    no_record: (r) => r.recordCount === 0 && r.state !== 'cancelled',
    waitlisted: (r) => r.state === 'waitlisted',
    cancelled: (r) => r.state === 'cancelled',
  };
  let items = filter && filters[filter] ? all.filter(filters[filter]) : filter === '' || filter === 'all' ? live : live;
  if (q) items = items.filter((r) => r.nickname.toLowerCase().includes(q) || r.region.toLowerCase().includes(q));
  const totals = live.map((r) => r.startTotal).filter((t): t is number => t !== null);
  return json({
    items,
    counts: {
      all: live.length, noStart: live.filter(filters.no_start).length, reminderOff: live.filter(filters.reminder_off).length,
      noRecord: live.filter(filters.no_record).length, waitlisted: all.filter(filters.waitlisted).length, cancelled: all.filter(filters.cancelled).length,
      withStart: totals.length, avgStart: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null,
      checklistComplete: live.filter((r) => r.checklistDone > 0).length, research: live.filter((r) => r.research).length,
    },
  });
};

// ---- export ------------------------------------------------------------------

/** CSV cell: quotes escaped; a leading = + - @ is neutralised (spreadsheet formula injection). */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const STATE_LABEL: Record<string, string> = { applied: '신청', waitlisted: '대기', cancelled: '취소', paused: '쉬는 중', quit: '그만둠', signed: '서명' };

export const adminExport: Handler = async (req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const c = await loadCampaignRow(ctx, p.id);
  if (!c) return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
  const kind = new URL(req.url).searchParams.get('kind');
  if (kind !== 'ops' && kind !== 'research') return fail(400, 'BAD_KIND', '내려받기 종류를 골라 주세요');
  let rows = await partRows(ctx, c.id);
  const head = kind === 'ops' ? ['활동명'] : ['일련번호'];
  head.push('지역', '신청일', '상태', '출발점(톤)', '기록 수', '마무리(톤)');
  if (kind === 'research') rows = rows.filter((r) => r.research);
  const lines = [head.map(cell).join(',')];
  rows.forEach((r, i) => {
    lines.push([kind === 'ops' ? r.nickname : i + 1, r.region, r.appliedOn, STATE_LABEL[r.state] ?? r.state, r.startTotal, r.recordCount, r.endTotal].map(cell).join(','));
  });
  await audit(ctx, 'export', 'campaign', c.id, { kind, rows: rows.length });
  return new Response('﻿' + lines.join('\r\n') + '\r\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="participants-${kind}-${c.id}.csv"`,
    },
  });
};

// ---- notice ------------------------------------------------------------------

export const sendNotice: Handler = async (req, ctx, p) => {
  const c = await loadCampaignRow(ctx, p.id);
  if (!c) return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
  const staff = c.host_group_id ? isStaffRole(ctx, c.host_group_id, await memberRole(ctx, c.host_group_id, ctx.userId)) : false;
  if (ctx.role !== 'admin' && !staff) return fail(403, 'FORBIDDEN', '관리자나 주최 모임 운영진만 보낼 수 있어요');
  const b = await readBody(req);
  if (!b) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const target = str(b.target) || 'all', title = str(b.title), body = typeof b.body === 'string' ? b.body.trim() : '';
  if (!['all', 'no_start', 'reminder_off', 'no_record'].includes(target)) return fail(400, 'BAD_TARGET', '받는 대상이 올바르지 않아요');
  if (!title || [...title].length > 100) return fail(400, 'BAD_TITLE', '제목은 1~100자로 써 주세요');
  if (!body || body.length > 5000) return fail(400, 'BAD_BODY', '내용은 1~5000자로 써 주세요');
  const all = (await partRows(ctx, c.id)).filter((r) => ['applied', 'signed', 'paused', 'waitlisted'].includes(r.state));
  const pick = {
    all: () => true, no_start: (r: (typeof all)[number]) => r.startTotal === null, reminder_off: (r: (typeof all)[number]) => !r.reminderOn,
    no_record: (r: (typeof all)[number]) => r.recordCount === 0,
  }[target as 'all']!;
  const targets = all.filter(pick);
  const noticeId = nanoid();
  for (const r of targets) await notify(ctx.db, r.userId, 'notice', `「${c.title}」 공지 · ${title}`, `/campaigns/${c.id}`, `notice:${noticeId}:${r.userId}`, ctx.simDate);
  let postId: string | null = null;
  if (b.alsoBoard === true && ctx.userId) {
    postId = nanoid();
    await ctx.db.run("INSERT INTO posts (id, created_at, board_type, board_id, category, title, body, author_id, sim_date) VALUES (?,?,'campaign',?,'공지',?,?,?,?)",
      postId, ctx.now, c.id, title, body, ctx.userId, ctx.simDate);
  }
  await audit(ctx, 'notice', 'campaign', c.id, { target, sent: targets.length });
  return json({ sent: targets.length, postId }, 201);
};

// ---- reports -----------------------------------------------------------------

const TARGET_TABLE: Record<string, string> = { post: 'posts', comment: 'comments', group: 'groups' };

export const adminReports: Handler = async (_req, ctx) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const rows = await ctx.db.all<{ id: string; created_at: string; target_type: string; target_id: string; reason: string; status: string; reporter: string | null }>(
    `SELECT r.id, r.created_at, r.target_type, r.target_id, r.reason, r.status, u.nickname reporter FROM reports r LEFT JOIN users u ON u.id = r.reporter_id
     ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 200`);
  const items = [];
  for (const r of rows) {
    const t = TARGET_TABLE[r.target_type];
    const target = t ? await ctx.db.first<Record<string, unknown>>(`SELECT * FROM ${t} WHERE id = ?`, r.target_id) : null;
    items.push({
      id: r.id, targetType: r.target_type, targetId: r.target_id, reason: r.reason, status: r.status, createdAt: r.created_at, reporter: r.reporter,
      preview: target ? String(target.title ?? target.body ?? target.name ?? '').slice(0, 120) : null,
      targetHidden: target ? !!target.hidden : null,
    });
  }
  return json({ items, open: items.filter((i) => i.status === 'open').length });
};

export const resolveReport: Handler = async (req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const r = await ctx.db.first<{ id: string; target_type: string; target_id: string; status: string }>('SELECT * FROM reports WHERE id = ?', p.id);
  if (!r) return fail(404, 'REPORT_NOT_FOUND', '신고를 찾을 수 없어요');
  const b = await readBody(req);
  const action = str(b?.action), reason = str(b?.reason);
  if (action !== 'hide' && action !== 'dismiss') return fail(400, 'BAD_ACTION', '지원하지 않는 동작이에요');
  if (action === 'hide' && (!reason || [...reason].length > 300)) return fail(400, 'BAD_REASON', '숨기는 사유를 300자 이내로 써 주세요');
  if (r.status !== 'open') return fail(409, 'ALREADY_RESOLVED', '이미 처리한 신고예요');
  if (action === 'hide') {
    const t = TARGET_TABLE[r.target_type];
    if (t === 'posts' || t === 'comments') {
      await ctx.db.run(`UPDATE ${t} SET hidden = 1 WHERE id = ?`, r.target_id);
      if (b?.notify === true) {
        const a = await ctx.db.first<{ author_id: string }>(`SELECT author_id FROM ${t} WHERE id = ?`, r.target_id);
        if (a) await notify(ctx.db, a.author_id, 'report_hidden', `신고가 접수되어 글이 숨겨졌어요 · ${reason}`, '/me', `report_hidden:${r.id}`, ctx.simDate);
      }
    }
  }
  await ctx.db.run('UPDATE reports SET status = ? WHERE id = ?', action === 'hide' ? 'hidden' : 'dismissed', r.id);
  await audit(ctx, `report_${action}`, r.target_type, r.target_id, { reportId: r.id, reason });
  return json({ ok: true, status: action === 'hide' ? 'hidden' : 'dismissed' });
};

// ---- groups · users ------------------------------------------------------------

export const adminGroups: Handler = async (_req, ctx) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const rows = await ctx.db.all<{ id: string; name: string; join_policy: string; sido: string; closed_at: string | null; created_at: string; members: number }>(
    `SELECT g.id, g.name, g.join_policy, g.sido, g.closed_at, g.created_at,
            (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id AND m.role IN ('owner','staff','member')) members
     FROM groups g ORDER BY g.created_at DESC LIMIT 500`);
  return json({ items: rows.map((g) => ({ id: g.id, name: g.name, joinPolicy: g.join_policy, region: g.sido, memberCount: g.members, closedAt: g.closed_at, createdAt: g.created_at })) });
};

/** Same rule as the owner's close: blocked while the group hosts a live campaign. */
export const adminCloseGroup: Handler = async (_req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const g = await getGroup(ctx, p.id);
  if (!g) return fail(404, 'GROUP_NOT_FOUND', '모임을 찾을 수 없어요');
  if (g.closed_at) return fail(409, 'GROUP_CLOSED', '이미 닫힌 모임이에요');
  const active = await campaignBadge(ctx, g.id, true);
  if (active) return fail(409, 'HAS_ACTIVE_CAMPAIGN', `「${active.title}」 캠페인이 있어서 닫을 수 없어요`);
  await ctx.db.run('UPDATE groups SET closed_at = ? WHERE id = ?', ctx.now, g.id);
  await audit(ctx, 'group_close', 'group', g.id);
  return json({ ok: true, closedAt: ctx.now });
};

export const adminUsers: Handler = async (req, ctx) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  const rows = await ctx.db.all<{ id: string; nickname: string; sido: string; sigungu: string; created_at: string; restricted: number }>(
    `SELECT id, nickname, sido, sigungu, created_at, restricted FROM users ${q ? "WHERE nickname LIKE ? ESCAPE '\\' OR sido LIKE ? ESCAPE '\\'" : ''} ORDER BY created_at DESC LIMIT 200`,
    ...(q ? [likeEscape(q), likeEscape(q)] : []));
  return json({ items: rows.map((u) => ({ id: u.id, nickname: u.nickname, region: [u.sido, u.sigungu].filter(Boolean).join(' '), joinedAt: u.created_at, restricted: !!u.restricted })) });
};

export const restrictUser: Handler = async (req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const b = await readBody(req);
  if (typeof b?.restricted !== 'boolean') return fail(400, 'BAD_RESTRICTED', '제한 여부를 true나 false로 보내 주세요');
  const r = await ctx.db.run('UPDATE users SET restricted = ? WHERE id = ?', b.restricted ? 1 : 0, p.id);
  if (!r.changes) return fail(404, 'USER_NOT_FOUND', '회원을 찾을 수 없어요');
  await audit(ctx, b.restricted ? 'user_restrict' : 'user_unrestrict', 'user', p.id);
  return json({ id: p.id, restricted: b.restricted });
};

/** 주최 모임 운영진용 참가자 기록 목록(내려받기 없음). */
export const groupParticipants: Handler = async (_req, ctx, p) => {
  const c = await ctx.db.first<{ id: string; host_group_id: string | null }>('SELECT id, host_group_id FROM campaigns WHERE id = ?', p.cid);
  if (!c || c.host_group_id !== p.id) return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
  const role = await memberRole(ctx, p.id, ctx.userId);
  if (!isStaffRole(ctx, p.id, role) && ctx.role !== 'admin') return fail(403, 'NOT_STAFF', '운영진만 볼 수 있어요');
  const items = (await partRows(ctx, c.id)).filter((r) => r.state !== 'cancelled' && r.state !== 'waitlisted');
  return json({ items: items.map((r) => ({ nickname: r.nickname, startTotal: r.startTotal, recordCount: r.recordCount })) });
};
