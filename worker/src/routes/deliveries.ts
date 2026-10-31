import { nanoid } from 'nanoid';
import { checkFileSize } from '@shared/validate';
import type { SignatureSettings } from '../campaignSettings';
import { fail, json, type Handler } from '../db';
import { notify } from '../notify';
import { settingsOf, visibleTo } from './campaigns';
import { readBody, requireAdmin, str } from './common';
import { decodeBase64 } from './posts';
import { loadCampaignRow } from './participations';

const len = (s: string) => [...s].length;
const isoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function view(ctx: Parameters<Handler>[1], d: { id: string; created_at: string; summary_json: string; photo_file_id: string | null }) {
  const sum = JSON.parse(d.summary_json) as { summary?: string; councils?: string[] };
  const answers = await ctx.db.all<{ id: string; council: string; answered_on: string | null; body: string }>(
    'SELECT id, council, answered_on, body FROM delivery_answers WHERE delivery_id = ? ORDER BY created_at', d.id);
  return {
    id: d.id, summary: sum.summary ?? '', councils: sum.councils ?? [], photoFileId: d.photo_file_id, createdAt: d.created_at,
    answers: answers.map((a) => ({ id: a.id, council: a.council, date: a.answered_on, body: a.body })),
  };
}

async function signatureCampaign(ctx: Parameters<Handler>[1], id: string) {
  const c = await loadCampaignRow(ctx, id);
  if (!c || c.type !== 'signature') return null;
  return c;
}

export const getDelivery: Handler = async (_req, ctx, p) => {
  const c = await signatureCampaign(ctx, p.id);
  if (!c || !visibleTo(ctx, c)) return fail(404, 'CAMPAIGN_NOT_FOUND', '캠페인을 찾을 수 없어요');
  const d = await ctx.db.first<{ id: string; created_at: string; summary_json: string; photo_file_id: string | null }>('SELECT * FROM deliveries WHERE campaign_id = ?', c.id);
  return json({ delivery: d ? await view(ctx, d) : null });
};

/** 전달 결과 올리기: one per campaign (re-posting replaces it); every signer is notified. */
export const postDelivery: Handler = async (req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const c = await signatureCampaign(ctx, p.id);
  if (!c) return fail(404, 'CAMPAIGN_NOT_FOUND', '서명 캠페인을 찾을 수 없어요');
  const b = await readBody(req);
  if (!b) return fail(400, 'BAD_JSON', '요청 형식이 올바르지 않아요');
  const summary = str(b.summary);
  if (!summary || len(summary) > 2000) return fail(400, 'BAD_SUMMARY', '전달 결과를 2000자 이내로 써 주세요');
  const councils = Array.isArray(b.councils) ? b.councils.map(str).filter(Boolean) : [];
  if (councils.length > 50 || councils.some((x) => len(x) > 40)) return fail(400, 'BAD_COUNCILS', '전달처가 올바르지 않아요');
  let fileId: string | null = null;
  const stmts: Array<[string, unknown[]]> = [];
  if (typeof b.photoBase64 === 'string' && b.photoBase64) {
    const data = decodeBase64(b.photoBase64);
    if (!data) return fail(400, 'BAD_PHOTO', '사진을 읽을 수 없어요');
    if (!checkFileSize(data.byteLength)) return fail(413, 'FILE_TOO_LARGE', '파일은 1MB 이하만 올릴 수 있어요');
    fileId = nanoid();
    const mime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(str(b.photoMime)) ? str(b.photoMime) : 'image/jpeg';
    stmts.push(['INSERT INTO files (id, created_at, mime, bytes, data, owner_id, sim_date) VALUES (?,?,?,?,?,?,?)',
      [fileId, ctx.now, mime, data.byteLength, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), ctx.userId, ctx.simDate]]);
  }
  const prev = await ctx.db.first<{ id: string }>('SELECT id FROM deliveries WHERE campaign_id = ?', c.id);
  const id = prev?.id ?? nanoid();
  const json_ = JSON.stringify({ summary, councils });
  if (prev) stmts.push(['UPDATE deliveries SET summary_json = ?, photo_file_id = COALESCE(?, photo_file_id), status = ? WHERE id = ?', [json_, fileId, 'posted', id]]);
  else stmts.push(['INSERT INTO deliveries (id, created_at, campaign_id, status, summary_json, sim_date, photo_file_id) VALUES (?,?,?,?,?,?,?)', [id, ctx.now, c.id, 'posted', json_, ctx.simDate, fileId]]);
  await ctx.db.batch(stmts);

  if ((settingsOf(c) as SignatureSettings).deliveryNotice !== false) {
    const signers = await ctx.db.all<{ user_id: string }>("SELECT user_id FROM participations WHERE campaign_id = ? AND state = 'signed'", c.id);
    for (const s of signers) await notify(ctx.db, s.user_id, 'delivery_result', `「${c.title}」 요구안 전달 결과가 올라왔어요`, `/campaigns/${c.id}`, `delivery:${id}:${s.user_id}`, ctx.simDate);
  }
  return json({ id, notified: true }, prev ? 200 : 201);
};

export const postDeliveryAnswer: Handler = async (req, ctx, p) => {
  const denied = requireAdmin(ctx);
  if (denied) return denied;
  const c = await signatureCampaign(ctx, p.id);
  if (!c) return fail(404, 'CAMPAIGN_NOT_FOUND', '서명 캠페인을 찾을 수 없어요');
  const d = await ctx.db.first<{ id: string }>('SELECT id FROM deliveries WHERE campaign_id = ?', c.id);
  if (!d) return fail(409, 'NO_DELIVERY', '전달 결과를 먼저 올려 주세요');
  const b = await readBody(req);
  const council = str(b?.council), date = str(b?.date), body = str(b?.body);
  if (!council || len(council) > 40) return fail(400, 'BAD_COUNCIL', '전달처를 적어 주세요');
  if (!isoDate(date)) return fail(400, 'BAD_DATE', '답변 날짜가 올바르지 않아요');
  if (!body || len(body) > 2000) return fail(400, 'BAD_BODY', '답변을 2000자 이내로 써 주세요');
  const id = nanoid();
  await ctx.db.run('INSERT INTO delivery_answers (id, created_at, delivery_id, author_id, body, sim_date, council, answered_on) VALUES (?,?,?,?,?,?,?,?)', id, ctx.now, d.id, ctx.userId, body, ctx.simDate, council, date);
  return json({ id }, 201);
};
