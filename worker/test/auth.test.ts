import { describe, expect, test } from 'vitest';
import { issueToken, verifyToken } from '../src/auth';
import { harness } from './helpers/client';

const DAY = 24 * 60 * 60 * 1000;

describe('auth', () => {
  test('enter with wrong passcode → 401', async () => {
    const h = harness();
    const res = await h.call('POST', '/api/enter', { body: { passcode: 'nope' }, token: null });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('BAD_PASSCODE');
  });

  test('enter with right passcode → token that works', async () => {
    const h = harness();
    const res = await h.call('POST', '/api/enter', { body: { passcode: 'test-pass' }, token: null });
    expect(res.status).toBe(200);
    const { token } = await res.json();
    const me = await h.call('GET', '/api/users', { token });
    expect(me.status).toBe(200);
  });

  test('request without token → 401 NO_TOKEN', async () => {
    const h = harness();
    const res = await h.call('GET', '/api/users', { token: null });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('NO_TOKEN');
  });

  test('expired token (31 days) → 401', async () => {
    const h = harness();
    const old = await issueToken(h.env.TOKEN_SECRET, Date.now() - 31 * DAY);
    const res = await h.call('GET', '/api/users', { token: old });
    expect(res.status).toBe(401);
  });

  test('token verification', async () => {
    const now = Date.now();
    const t = await issueToken('s', now);
    expect(await verifyToken('s', t, now + 29 * DAY)).toBe(true);
    expect(await verifyToken('s', t, now + 31 * DAY)).toBe(false);
    expect(await verifyToken('other', t, now)).toBe(false);
    expect(await verifyToken('s', 'garbage', now)).toBe(false);
  });

  test('sim header validation', async () => {
    const h = harness();
    const bad = async (headers: Record<string, string>) => {
      const r = await h.call('GET', '/api/users', { headers });
      return [r.status, (await r.json()).error?.code];
    };
    expect(await bad({ 'X-Sim-Date': '2026-02-30' })).toEqual([400, 'BAD_SIM_DATE']);
    expect(await bad({ 'X-Sim-Date': '2026-2-3' })).toEqual([400, 'BAD_SIM_DATE']);
    expect((await bad({ 'X-Sim-Time': '25:00' }))[0]).toBe(400);
    expect((await bad({ 'X-Role': 'root' }))[0]).toBe(400);
    const ok = await h.call('GET', '/api/users', {
      headers: { 'X-Sim-Date': '2026-11-02', 'X-Sim-Time': '09:30', 'X-Role': 'staff' },
    });
    expect(ok.status).toBe(200);
  });

  test('CORS only for allowed origins', async () => {
    const h = harness();
    const ok = await h.call('GET', '/api/users', { headers: { Origin: 'https://minskapo.github.io' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://minskapo.github.io');
    const no = await h.call('GET', '/api/users', { headers: { Origin: 'https://evil.test' } });
    expect(no.headers.get('access-control-allow-origin')).toBeNull();
  });
});
