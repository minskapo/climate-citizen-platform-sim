import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, apiBlob, ApiError, simHeaders } from './api';
import { __reloadSimForTest, simStore } from './sim';

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

beforeEach(() => {
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ token: 'tok', userId: 'u1', nickname: '초록이', role: 'member', fixedDate: '2027-02-08', timeOverride: '14:00' });
});
afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  test('sends sim headers', async () => {
    const f = reply(200, { ok: true });
    vi.stubGlobal('fetch', f);
    await api('/api/me');
    const h = (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(h).toMatchObject({ 'X-Sim-Token': 'tok', 'X-User-Id': 'u1', 'X-Role': 'member', 'X-Sim-Date': '2027-02-08', 'X-Sim-Time': '14:00' });
  });

  test('guest role hides the user id; staff sends the group', () => {
    simStore.set({ role: 'guest' });
    expect(simHeaders()['X-User-Id']).toBeUndefined();
    simStore.set({ role: 'staff', staffGroupId: 'g1' });
    expect(simHeaders()['X-Staff-Group']).toBe('g1');
  });

  test('401 BAD_TOKEN drops the token (back to gate)', async () => {
    vi.stubGlobal('fetch', reply(401, { error: { code: 'BAD_TOKEN', message: 'x' } }));
    await expect(api('/api/me')).rejects.toBeInstanceOf(ApiError);
    expect(simStore.get().token).toBeNull();
  });

  test('apiBlob: 401 BAD_TOKEN also drops the token (export returns to gate)', async () => {
    vi.stubGlobal('fetch', reply(401, { error: { code: 'BAD_TOKEN', message: 'x' } }));
    await expect(apiBlob('/api/admin/campaigns/c1/export?kind=ops', { quiet: true })).rejects.toBeInstanceOf(ApiError);
    expect(simStore.get().token).toBeNull();
  });

  test('401 NO_USER keeps the token', async () => {
    vi.stubGlobal('fetch', reply(401, { error: { code: 'NO_USER', message: 'x' } }));
    await expect(api('/api/me')).rejects.toMatchObject({ code: 'NO_USER' });
    expect(simStore.get().token).toBe('tok');
  });

  test('503 DAILY_CAP shows the cap toast', async () => {
    const toast = await import('../components/Toast');
    const spy = vi.spyOn(toast, 'showToast');
    vi.stubGlobal('fetch', reply(503, { error: { code: 'DAILY_CAP', message: 'x' } }));
    await expect(api('/api/groups', { body: {} })).rejects.toMatchObject({ code: 'DAILY_CAP' });
    expect(spy).toHaveBeenCalledWith('오늘 체험 한도에 가까워 잠시 멈췄어요');
  });
});
