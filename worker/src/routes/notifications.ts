import { addDays, diffDays } from '@shared/date';
import { recordSlots } from '@shared/missions';
import { dueNotifications, type DueInput } from '@shared/notificationsDue';
import { json, type Ctx, type Handler } from '../db';
import { notify } from '../notify';
import type { OfflineSettings, PracticeSettings } from '../campaignSettings';
import { scheduleOf, settingsOf, statusOf, visibleTo, type CampaignRow } from './campaigns';
import { readBody, requireUser } from './common';

interface NotifRow { id: string; created_at: string; kind: string; text: string; link: string; read: number; sim_date: string | null }

const unreadOf = async (ctx: Ctx, uid: string) =>
  (await ctx.db.first<{ n: number }>('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0', uid))?.n ?? 0;

export const listNotifications: Handler = async (req, ctx) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const onlyUnread = new URL(req.url).searchParams.get('unread') === '1';
  const rows = await ctx.db.all<NotifRow>(
    `SELECT id, created_at, kind, text, link, read, sim_date FROM notifications WHERE user_id = ? ${onlyUnread ? 'AND read = 0' : ''} ORDER BY created_at DESC, rowid DESC LIMIT 100`,
    uid,
  );
  return json({
    items: rows.map((r) => ({ id: r.id, kind: r.kind, text: r.text, link: r.link, read: !!r.read, createdAt: r.created_at, simDate: r.sim_date })),
    unread: await unreadOf(ctx, uid),
  });
};

/** Marks the given ids read; without ids, marks everything read. */
export const readNotifications: Handler = async (req, ctx) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const body = (await readBody(req)) ?? {};
  if (Array.isArray(body.ids)) {
    const ids = body.ids.filter((x): x is string => typeof x === 'string').slice(0, 200);
    if (ids.length) await ctx.db.run(`UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`, uid, ...ids);
  } else {
    await ctx.db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', uid);
  }
  return json({ unread: await unreadOf(ctx, uid) });
};

interface PRow { id: string; campaign_id: string; answers_json: string; paused_from: string | null; paused_until: string | null; type: string; title: string; schedule_json: string; settings_json: string }

/** Computes date-driven notifications for the caller's own date/time and inserts each once (dedupe_key). */
export const syncNotifications: Handler = async (_req, ctx) => {
  const uid = requireUser(ctx);
  if (uid instanceof Response) return uid;
  const rows = await ctx.db.all<PRow>(
    `SELECT p.id, p.campaign_id, p.answers_json, p.paused_from, p.paused_until, c.type, c.title, c.schedule_json, c.settings_json
     FROM participations p JOIN campaigns c ON c.id = p.campaign_id
     WHERE p.user_id = ? AND p.state = 'applied' AND c.publish <> 'draft'`,
    uid,
  );
  const prefs = JSON.parse((await ctx.db.first<{ settings_json: string }>('SELECT settings_json FROM users WHERE id = ?', uid))?.settings_json ?? '{}') as { reminderTime?: string; reminderOn?: boolean };
  const userTime = typeof prefs.reminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(prefs.reminderTime) ? prefs.reminderTime : null;
  const offline: DueInput['offline'] = [];
  const byTime = new Map<string, DueInput['participations']>();
  for (const r of rows) {
    const c = r as unknown as CampaignRow;
    if (r.type === 'offline') {
      const s = scheduleOf(c);
      const o = settingsOf(c) as OfflineSettings;
      if (o.preNotice !== false && s.eventDate && s.eventStart) offline.push({ campaignId: r.campaign_id, title: r.title, eventDate: s.eventDate, eventStart: s.eventStart });
      continue;
    }
    if (r.type !== 'practice') continue;
    const s = scheduleOf(c);
    const ps = settingsOf(c) as PracticeSettings;
    if (!ps.recordEnabled || !s.runStart || !s.runDays) continue;
    const rem = (JSON.parse(r.answers_json) as { reminder?: { enabled?: boolean; time?: string } }).reminder;
    if (rem?.enabled === false || (rem?.enabled === undefined && prefs.reminderOn === false)) continue;
    const time = rem?.time ?? userTime ?? ps.reminderTime ?? '20:00';
    const recorded = (await ctx.db.all<{ slot_date: string }>('SELECT slot_date FROM records WHERE participation_id = ?', r.id)).map((x) => x.slot_date);
    const paused = r.paused_from && r.paused_until
      ? Array.from({ length: diffDays(r.paused_from, r.paused_until) + 1 }, (_, i) => addDays(r.paused_from!, i))
      : [];
    const list = byTime.get(time) ?? [];
    list.push({ campaignId: r.campaign_id, title: r.title, slots: recordSlots(ps.recordCycle, s.runStart, s.runDays), recorded, paused });
    byTime.set(time, list);
  }
  const inputs: DueInput[] = [...byTime.entries()].map(([reminderTime, participations]) => ({ today: ctx.simDate, nowTime: ctx.simTime, reminderTime, participations, offline: [] }));
  inputs.push({ today: ctx.simDate, nowTime: ctx.simTime, reminderTime: '20:00', participations: [], offline });
  for (const input of inputs) {
    for (const d of dueNotifications(input)) {
      await notify(ctx.db, uid, d.kind, d.text, `/campaigns/${d.campaignId}`, `${uid}:${d.dedupeKey}`, ctx.simDate);
    }
  }
  // 알림 받기: subscribed (while 모집 예정) campaigns whose recruiting has opened at the caller's date.
  const subs = await ctx.db.all<CampaignRow & { sub_sim_date: string | null }>(
    `SELECT c.*, s.sim_date sub_sim_date FROM campaign_subscriptions s JOIN campaigns c ON c.id = s.campaign_id
     WHERE s.user_id = ? AND c.publish <> 'draft'`,
    uid,
  );
  for (const c of subs) {
    const st = statusOf(ctx, c);
    if (st !== 'recruiting' || !visibleTo(ctx, c, st)) continue;
    const start = scheduleOf(c).recruitStart;
    if (c.sub_sim_date && start && c.sub_sim_date >= start) continue; // subscribed after it had opened
    await notify(ctx.db, uid, 'recruit_open', `「${c.title}」 모집이 시작됐어요. 지금 신청할 수 있어요.`, `/campaigns/${c.id}`, `${uid}:recruit_open:${c.id}`, ctx.simDate);
  }
  return json({ unread: await unreadOf(ctx, uid) });
};
