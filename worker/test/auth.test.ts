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
    const old = await issueToken(h.env.TOKEN_SECRET, Date.now() - 31 * DAY, h.env.SIM_PASSCODE);
    const res = await h.call('GET', '/api/users', { token: old });
    expect(res.status).toBe(401);
  });

  test('token issued under passcode A fails under passcode B', async () => {
    const now = Date.now();
    const t = await issueToken('s', now, 'pass-A');
    expect(await verifyToken('s', t, now, 'pass-A')).toBe(true);
    expect(await verifyToken('s', t, now, 'pass-B')).toBe(false);
  });

  test('rotating SIM_PASSCODE alone logs everyone out', async () => {
    const h = harness();
    const { token } = await (await h.call('POST', '/api/enter', { body: { passcode: 'test-pass' }, token: null })).json();
    const { handle } = await import('../src/index');
    const rotated = { ...h.env, SIM_PASSCODE: 'rotated-pass' };
    const res = await handle(new Request('https://x.test/api/users', { headers: { 'X-Sim-Token': token } }), rotated, h.db);
    expect(res.status).toBe(401);
  });

  test('token verification', async () => {
    const now = Date.now();
    const t = await issueToken('s', now, 'p');
    expect(await verifyToken('s', t, now + 29 * DAY, 'p')).toBe(true);
    expect(await verifyToken('s', t, now + 31 * DAY, 'p')).toBe(false);
    expect(await verifyToken('other', t, now, 'p')).toBe(false);
    expect(await verifyToken('s', 'garbage', now, 'p')).toBe(false);
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

  test('tampered token MAC or timestamp is rejected', async () => {
    const now = Date.now();
    const t = await issueToken('s', now, 'p');
    const [ts, mac] = t.split('.');
    const flipped = mac.slice(0, -1) + (mac.endsWith('0') ? '1' : '0');
    expect(await verifyToken('s', `${ts}.${flipped}`, now, 'p')).toBe(false);
    expect(await verifyToken('s', `${Number(ts) + 1000}.${mac}`, now + 2000, 'p')).toBe(false);
    expect(await verifyToken('s', `${Number(ts) + 10 * DAY}.${mac}`, now, 'p')).toBe(false);
  });

  test('enter throttles per IP: 11th failed attempt → 429 without checking passcode', async () => {
    const h = harness();
    const ip = { 'CF-Connecting-IP': '1.2.3.4' };
    for (let i = 0; i < 10; i++) {
      const r = await h.call('POST', '/api/enter', { body: { passcode: 'bad' }, token: null, headers: ip });
      expect(r.status).toBe(401);
    }
    const blocked = await h.call('POST', '/api/enter', { body: { passcode: 'test-pass' }, token: null, headers: ip });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe('TOO_MANY_ATTEMPTS');
    const other = await h.call('POST', '/api/enter', { body: { passcode: 'test-pass' }, token: null, headers: { 'CF-Connecting-IP': '5.6.7.8' } });
    expect(other.status).toBe(200);
  });

  test('successful enter does not count toward throttle', async () => {
    const h = harness();
    const ip = { 'CF-Connecting-IP': '9.9.9.9' };
    for (let i = 0; i < 15; i++) {
      expect((await h.call('POST', '/api/enter', { body: { passcode: 'test-pass' }, token: null, headers: ip })).status).toBe(200);
    }
  });
});
