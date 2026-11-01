import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createBridgeHost, type Manifest } from './bridge';
import { BRIDGE_CLIENT, injectBridge } from './template';
import { __reloadSimForTest, simStore } from '../../lib/sim';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const flush = () => new Promise((r) => setTimeout(r, 0));

const baseManifest: Manifest = { permissions: [], saveKeys: [], aggregateKeys: [], startPoint: false };

let iframe: HTMLIFrameElement;
let posted: unknown[];
let dispose: (() => void) | null = null;

function setup(manifest: Partial<Manifest> = {}, extra: { preview?: boolean; campaignId?: string } = {}) {
  const onResize = vi.fn();
  const onToast = vi.fn();
  dispose = createBridgeHost({
    iframe, tool: { id: 't1', manifest: { ...baseManifest, ...manifest } }, campaignId: extra.campaignId, preview: extra.preview ?? false, onResize, onToast,
  });
  return { onResize, onToast };
}

/** 블록 iframe 안에서 보낸 것처럼 메시지를 보낸다. */
async function send(method: string, args: unknown[] = [], source: Window | null = iframe.contentWindow) {
  const id = Math.random().toString(36).slice(2);
  window.dispatchEvent(new MessageEvent('message', { data: { __bridge: 1, id, method, args }, source }));
  for (let i = 0; i < 5; i++) await flush();
  return posted.find((m) => (m as { id: string }).id === id) as { __bridge: 1; id: string; ok: boolean; result?: unknown; error?: { code: string } } | undefined;
}

beforeEach(() => {
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ token: 'tok', userId: 'u1', nickname: '초록이', role: 'member', fixedDate: '2027-02-08' });
  iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  posted = [];
  vi.spyOn(iframe.contentWindow!, 'postMessage').mockImplementation(((m: unknown) => { posted.push(m); }) as never);
});
afterEach(() => {
  dispose?.();
  dispose = null;
  iframe.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bridge host', () => {
  test('bridge clamps height', async () => {
    const { onResize } = setup();
    const r = await send('resize', [100000]);
    expect(r?.ok).toBe(true);
    expect(onResize).toHaveBeenLastCalledWith(3000);
    await send('resize', [-20]);
    expect(onResize).toHaveBeenLastCalledWith(0);
  });

  test('bridge ignores messages from other frames', async () => {
    const other = document.createElement('iframe');
    document.body.appendChild(other);
    const { onResize } = setup();
    const r = await send('resize', [200], other.contentWindow);
    expect(onResize).not.toHaveBeenCalled();
    expect(r).toBeUndefined();
    // 모양이 틀린 메시지도 무시한다
    window.dispatchEvent(new MessageEvent('message', { data: { method: 'resize', args: [10] }, source: iframe.contentWindow }));
    await flush();
    expect(onResize).not.toHaveBeenCalled();
    other.remove();
  });

  test('bridge denies unlisted permission', async () => {
    const f = vi.fn(async () => reply({}));
    vi.stubGlobal('fetch', f);
    setup({ permissions: ['user'], saveKeys: ['count'] });
    const r = await send('saveRecord', [{ count: 1 }]);
    expect(r).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
    expect((await send('listMyRecords'))?.error?.code).toBe('PERMISSION_DENIED');
    expect((await send('getParticipation'))?.error?.code).toBe('PERMISSION_DENIED');
    expect((await send('getAggregate', ['count']))?.error?.code).toBe('PERMISSION_DENIED');
    expect(f).not.toHaveBeenCalled();
  });

  test('preview saves with X-Preview header', async () => {
    const f = vi.fn(async () => reply({ id: 'r1', preview: true }, 201));
    vi.stubGlobal('fetch', f);
    setup({ permissions: ['record'], saveKeys: ['count'] }, { preview: true, campaignId: 'c1' });
    const r = await send('saveRecord', [{ count: 3 }]);
    expect(r).toMatchObject({ ok: true, result: { id: 'r1' } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/tools\/t1\/records$/);
    expect((init.headers as Record<string, string>)['X-Preview']).toBe('1');
    expect(JSON.parse(init.body as string)).toEqual({ campaignId: 'c1', values: { count: 3 } });
  });

  test('non-preview save has no X-Preview; unknown save key is refused', async () => {
    const f = vi.fn(async () => reply({ id: 'r2', preview: false }, 201));
    vi.stubGlobal('fetch', f);
    setup({ permissions: ['record'], saveKeys: ['count'] });
    expect((await send('saveRecord', [{ other: 1 }]))?.error?.code).toBe('BAD_KEY');
    await send('saveRecord', [{ count: 1 }]);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['X-Preview']).toBeUndefined();
  });

  test('getUser needs user permission and returns nickname + region', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ id: 'u1', nickname: '초록이', sido: '강원', sigungu: '원주시', consents: {}, settings: {} })));
    setup({ permissions: ['user'] });
    expect((await send('getUser'))?.result).toEqual({ nickname: '초록이', region: '강원 원주시' });
    dispose?.();
    setup();
    expect((await send('getUser'))?.error?.code).toBe('PERMISSION_DENIED');
  });

  test('getCampaign works without permission', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({
      campaign: { id: 'c1', type: 'practice', title: '4주 실천', schedule: { recruitStart: '2027-01-01', recruitEnd: '2027-02-01', runStart: '2027-02-02', runDays: 28 }, publish: 'now', showUpcoming: true },
      status: 'running', myParticipation: null,
    })));
    setup({}, { campaignId: 'c1' });
    expect((await send('getCampaign'))?.result).toEqual({ id: 'c1', title: '4주 실천', status: 'running', today: '2027-02-08', dayIndex: 7 });
  });

  test('getParticipation returns joined + start total', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/api/me/measurements')
      ? reply({ items: [{ id: 'm1', result: { total: 9.4 } }] })
      : reply({ campaign: { id: 'c1', type: 'practice', title: 'x', schedule: {} }, status: 'running', myParticipation: { state: 'applied', startMeasurementId: 'm1' } })));
    setup({ permissions: ['participation'] }, { campaignId: 'c1' });
    expect((await send('getParticipation'))?.result).toEqual({ joined: true, startTotal: 9.4 });
  });

  test('getAggregate only for declared keys', async () => {
    const f = vi.fn(async () => reply({ key: 'count', count: 2, participants: 2, sum: 7, avg: 3.5 }));
    vi.stubGlobal('fetch', f);
    setup({ aggregateKeys: [{ key: 'count', op: 'sum' }] }, { campaignId: 'c1' });
    expect((await send('getAggregate', ['count']))?.result).toMatchObject({ key: 'count', op: 'sum', value: 7, participants: 2 });
    expect((f.mock.calls[0] as unknown as [string])[0]).toMatch(/\/api\/aggregates\/tool\/t1\/count\?campaignId=c1$/);
    expect((await send('getAggregate', ['secret']))?.error?.code).toBe('PERMISSION_DENIED');
  });

  test('toast is cut to 60 chars; unknown method errors', async () => {
    const { onToast } = setup();
    await send('toast', ['가'.repeat(80)]);
    expect(onToast).toHaveBeenCalledWith('가'.repeat(60));
    expect((await send('deleteEverything'))?.error?.code).toBe('UNKNOWN_METHOD');
  });

  test('dispose stops answering', async () => {
    const { onResize } = setup();
    dispose!();
    dispose = null;
    expect(await send('resize', [10])).toBeUndefined();
    expect(onResize).not.toHaveBeenCalled();
  });
});

describe('template', () => {
  test('injects the client right after <head>', () => {
    const out = injectBridge('<!doctype html><html><head><title>t</title></head><body><header>h</header></body></html>');
    expect(out.startsWith('<!doctype html><html><head><script>')).toBe(true);
    expect(out).toContain(BRIDGE_CLIENT);
    expect(injectBridge('<p>hi</p>').startsWith('<script>')).toBe(true);
    expect(injectBridge('<!DOCTYPE html><p>hi</p>').startsWith('<!DOCTYPE html><script>')).toBe(true);
  });

  test('public tool-template.html carries the same bridge client', () => {
    const file = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/tool-template.html'), 'utf8');
    expect(file).toContain(BRIDGE_CLIENT.trim());
    expect(file).toContain('platform.saveRecord');
    expect(file).toContain('platform.getAggregate');
  });
});
