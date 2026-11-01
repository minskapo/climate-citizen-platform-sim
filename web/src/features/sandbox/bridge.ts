import { dayIndex } from '@shared/campaignStatus';
import { api, ApiError } from '../../lib/api';
import { simStore, simToday } from '../../lib/sim';
import { statusInputOf, type CampaignDetail } from '../campaigns/types';

/** 웹 도구 설명(manifest). Worker routes/tools.ts의 Manifest와 같다. */
export interface Manifest {
  permissions: Array<'user' | 'participation' | 'record'>;
  saveKeys: string[];
  aggregateKeys: Array<{ key: string; op: 'sum' | 'avg' | 'count' }>;
  startPoint: boolean;
}

export interface BridgeHostOptions {
  iframe: HTMLIFrameElement;
  tool: { id: string; manifest: Manifest };
  campaignId?: string;
  preview: boolean;
  onResize(h: number): void;
  onToast(t: string): void;
}

export const MAX_HEIGHT = 3000;
export const TOAST_MAX = 60;
const JOINED = new Set(['applied', 'signed', 'paused']);

class BridgeError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const denied = () => new BridgeError('PERMISSION_DENIED', '이 웹 도구에 허용되지 않은 기능이에요');
const badArgs = (m: string) => new BridgeError('BAD_ARGS', m);

interface BridgeRequest { __bridge: 1; id: string | number; method: string; args: unknown[] }
const isRequest = (d: unknown): d is BridgeRequest => {
  if (!d || typeof d !== 'object') return false;
  const r = d as Record<string, unknown>;
  return r.__bridge === 1 && (typeof r.id === 'string' || typeof r.id === 'number') && typeof r.method === 'string' && Array.isArray(r.args);
};
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * 블록 iframe 하나와 플랫폼 사이의 연결(postMessage). 그 iframe에서 온 메시지만 받고,
 * manifest에 적은 권한 안에서만 답한다. 해제 함수를 돌려준다.
 */
export function createBridgeHost(opts: BridgeHostOptions): () => void {
  const { iframe, tool, campaignId, preview } = opts;
  const m = tool.manifest ?? { permissions: [], saveKeys: [], aggregateKeys: [], startPoint: false };
  const perms = new Set(m.permissions ?? []);
  const need = (p: Manifest['permissions'][number]) => { if (!perms.has(p)) throw denied(); };
  const q = { quiet: true, preview } as const;
  let disposed = false;

  const loadDetail = () => (campaignId ? api<CampaignDetail>(`/api/campaigns/${encodeURIComponent(campaignId)}`, q) : Promise.resolve(null));

  const methods: Record<string, (args: unknown[]) => unknown> = {
    async getUser() {
      need('user');
      const s = simStore.get();
      if (!s.userId || s.role === 'guest') return null;
      const me = await api<{ nickname: string; sido?: string; sigungu?: string }>('/api/me', q);
      return { nickname: me.nickname, region: [me.sido, me.sigungu].filter(Boolean).join(' ') };
    },
    async getCampaign() {
      const d = await loadDetail();
      if (!d) return null;
      const today = simToday(simStore.get());
      let n: number | null = null;
      try { n = dayIndex(statusInputOf(d.campaign), today); } catch { n = null; }
      return { id: d.campaign.id, title: d.campaign.title, status: d.status, today, dayIndex: n };
    },
    async getParticipation() {
      need('participation');
      const d = await loadDetail();
      const mine = d?.myParticipation;
      if (!mine || !JOINED.has(mine.state)) return { joined: false, startTotal: null };
      let startTotal: number | null = null;
      if (mine.startMeasurementId) {
        const list = await api<{ items: Array<{ id: string; result?: { total?: number } }> }>('/api/me/measurements', q);
        startTotal = list.items.find((x) => x.id === mine.startMeasurementId)?.result?.total ?? null;
      }
      return { joined: true, startTotal };
    },
    async saveRecord([values]) {
      need('record');
      if (!isPlainObject(values)) throw badArgs('저장할 값은 { 이름: 값 } 모양이어야 해요');
      const bad = Object.keys(values).find((k) => !m.saveKeys.includes(k));
      if (bad) throw new BridgeError('BAD_KEY', `저장할 수 없는 값이에요: ${bad}`);
      const r = await api<{ id: string }>(`/api/tools/${encodeURIComponent(tool.id)}/records`, { ...q, method: 'POST', body: { campaignId: campaignId ?? null, values } });
      return { id: r.id };
    },
    async listMyRecords() {
      need('record');
      const r = await api<{ items: unknown[] }>(`/api/tools/${encodeURIComponent(tool.id)}/records/mine`, q);
      return r.items;
    },
    async getAggregate([key]) {
      const decl = typeof key === 'string' ? m.aggregateKeys.find((a) => a.key === key) : undefined;
      if (!decl) throw denied();
      const qs = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : '';
      const r = await api<{ key: string; count: number; participants: number; sum: number; avg: number | null }>(
        `/api/aggregates/tool/${encodeURIComponent(tool.id)}/${encodeURIComponent(decl.key)}${qs}`, q);
      const value = decl.op === 'sum' ? r.sum : decl.op === 'avg' ? r.avg : r.participants;
      return { key: decl.key, op: decl.op, value, count: r.count, participants: r.participants, sum: r.sum, avg: r.avg };
    },
    resize([h]) {
      if (typeof h !== 'number' || !Number.isFinite(h)) throw badArgs('높이는 숫자여야 해요');
      const v = Math.round(Math.min(MAX_HEIGHT, Math.max(0, h)));
      opts.onResize(v);
      return v;
    },
    toast([t]) {
      if (typeof t !== 'string' || !t.trim()) throw badArgs('알림 문구가 필요해요');
      const text = [...t.trim()].slice(0, TOAST_MAX).join('');
      opts.onToast(text);
      return null;
    },
  };

  const onMessage = async (e: MessageEvent) => {
    const win = iframe.contentWindow;
    if (disposed || !win || e.source !== win) return;
    const d: unknown = e.data;
    if (!isRequest(d)) return;
    let out: { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } };
    try {
      const fn = Object.prototype.hasOwnProperty.call(methods, d.method) ? methods[d.method] : null;
      if (!fn) throw new BridgeError('UNKNOWN_METHOD', `없는 기능이에요: ${d.method}`);
      out = { ok: true, result: (await fn(d.args)) ?? null };
    } catch (err) {
      const code = err instanceof BridgeError || err instanceof ApiError ? err.code : 'ERROR';
      out = { ok: false, error: { code, message: (err as Error).message || '요청을 처리하지 못했어요' } };
    }
    if (disposed) return;
    // 샌드박스 iframe은 출처가 'null'이라 대상 출처를 '*'로 둔다(보내는 창은 그 iframe으로 정해져 있다).
    iframe.contentWindow?.postMessage({ __bridge: 1, id: d.id, ...out }, '*');
  };

  window.addEventListener('message', onMessage);
  return () => {
    disposed = true;
    window.removeEventListener('message', onMessage);
  };
}
