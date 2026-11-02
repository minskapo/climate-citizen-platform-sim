import { afterEach, describe, expect, test, vi } from 'vitest';
import { as, on, setup, user } from './helpers/campaign';
import { attendanceCode } from '../src/routes/attendance';

const APPLY_DAY = '2027-01-10';

describe('participate', () => {
  test('outside recruiting → 409 NOT_RECRUITING', async () => {
    const { h, practice } = await setup();
    const id = await practice();
    const u = await user(h, '참가자');
    const r = await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, '2027-01-03'), body: { answers: {}, consents: {} } });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('NOT_RECRUITING');
  });

  test('practice participation, duplicate → 409', async () => {
    const { h, practice } = await setup();
    const id = await practice();
    const u = await user(h, '참가자');
    const r = await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: { research: true } } });
    expect(r.status).toBe(201);
    const b = await r.json();
    expect(b.waitlisted).toBe(false);
    expect(b.participation.state).toBe('applied');
    expect((await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: {} } })).status).toBe(409);
  });

  test('last seat race', async () => {
    const { h, offline } = await setup();
    const id = await offline({ capacity: 1 });
    const a = await user(h, '가');
    const b = await user(h, '나');
    const res = await Promise.all([a, b].map((u) => h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: {} } })));
    const bodies = await Promise.all(res.map((r) => r.json()));
    expect(res.map((r) => r.status)).toEqual([201, 201]);
    expect(bodies.map((x) => x.participation.state).sort()).toEqual(['applied', 'waitlisted']);
    expect(bodies.filter((x) => x.waitlisted)).toHaveLength(1);
  });

  test('many concurrent applicants never oversell', async () => {
    const { h, offline } = await setup();
    const id = await offline({ capacity: 3 });
    const users = await Promise.all([...Array(8)].map((_, i) => user(h, `사람${i}`)));
    const res = await Promise.all(users.map((u, i) => h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: {}, companions: i % 2 } })));
    expect(res.every((r) => r.status === 201)).toBe(true);
    const seats = await h.db.first<{ n: number }>("SELECT SUM(1 + companions) n FROM participations WHERE campaign_id = ? AND state = 'applied'", id);
    expect(seats!.n).toBeLessThanOrEqual(3);
    const nos = (await h.db.all<{ waitlist_no: number }>("SELECT waitlist_no FROM participations WHERE campaign_id = ? AND state = 'waitlisted' ORDER BY waitlist_no", id)).map((r) => r.waitlist_no);
    expect(new Set(nos).size).toBe(nos.length);
  });

  test('companions count toward capacity', async () => {
    const { h, offline } = await setup();
    const id = await offline({ capacity: 3 });
    const a = await user(h, '가');
    const b = await user(h, '나');
    const ra = await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(a, APPLY_DAY), body: { answers: {}, consents: {}, companions: 2 } })).json();
    expect(ra.participation.state).toBe('applied');
    expect(ra.participation.companions).toBe(2);
    const rb = await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(b, APPLY_DAY), body: { answers: {}, consents: {} } })).json();
    expect(rb.waitlisted).toBe(true);
    expect(rb.participation.waitlistNo).toBe(1);
    const d = await (await h.call('GET', `/api/campaigns/${id}`, on(b, APPLY_DAY))).json();
    expect(d.counts.seatsTaken).toBe(3);
    expect(d.counts.seatsLeft).toBe(0);
  });

  test('no waitlist → 409 FULL', async () => {
    const { h, offline } = await setup();
    const id = await offline({ capacity: 2, waitlist: false });
    const a = await user(h, '가');
    const r = await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(a, APPLY_DAY), body: { answers: {}, consents: {}, companions: 2 } });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('FULL');
  });

  test('cancel promotes waitlist once', async () => {
    const { h, offline } = await setup();
    const id = await offline({ capacity: 1 });
    const [a, b, c] = [await user(h, '가'), await user(h, '나'), await user(h, '다')];
    const pa = (await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(a, APPLY_DAY), body: { answers: {}, consents: {} } })).json()).participation.id;
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(b, APPLY_DAY), body: { answers: {}, consents: {} } });
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(c, APPLY_DAY), body: { answers: {}, consents: {} } });
    const [r1, r2] = await Promise.all([1, 2].map(() => h.call('POST', `/api/participations/${pa}/cancel`, on(a, APPLY_DAY))));
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const states = await h.db.all<{ user_id: string; state: string }>('SELECT user_id, state FROM participations WHERE campaign_id = ?', id);
    const st = Object.fromEntries(states.map((s) => [s.user_id, s.state]));
    expect(st).toEqual({ [a]: 'cancelled', [b]: 'applied', [c]: 'waitlisted' });
    const notes = await h.db.all<{ user_id: string }>("SELECT user_id FROM notifications WHERE kind = 'waitlist_confirmed'");
    expect(notes.map((n) => n.user_id)).toEqual([b]);
  });

  test('cancel after recruiting ends → 409', async () => {
    const { h, offline } = await setup();
    const id = await offline({ capacity: 5 });
    const a = await user(h, '가');
    const p = (await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(a, APPLY_DAY), body: { answers: {}, consents: {} } })).json()).participation.id;
    expect((await h.call('POST', `/api/participations/${p}/cancel`, on(a, '2027-01-22'))).status).toBe(409);
    const other = await user(h, '남');
    expect((await h.call('POST', `/api/participations/${p}/cancel`, on(other, APPLY_DAY))).status).toBe(404);
  });

  test('practice and offline auto-join host group (even approval groups)', async () => {
    const { h, practice, group } = await setup();
    const owner = await user(h, '모임장');
    const g = await group(owner, 'approval');
    const id = await practice({}, { hostGroupId: g });
    const u = await user(h, '참가자');
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: {} } });
    const m = await h.db.first<{ role: string }>('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', g, u);
    expect(m?.role).toBe('member');
  });

  test('signature hostJoin=ask joins only when joinHost=true', async () => {
    const { h, signature, group } = await setup();
    const owner = await user(h, '모임장');
    const g = await group(owner);
    const id = await signature({ hostJoin: 'ask' }, { hostGroupId: g });
    const [a, b] = [await user(h, '가', '서울'), await user(h, '나', '서울')];
    const ra = await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(a, APPLY_DAY), body: { answers: {}, consents: { delivery: true }, joinHost: true } });
    expect(ra.status).toBe(201);
    expect((await ra.json()).participation.state).toBe('signed');
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(b, APPLY_DAY), body: { answers: {}, consents: { delivery: true } } });
    const members = (await h.db.all<{ user_id: string }>('SELECT user_id FROM group_members WHERE group_id = ?', g)).map((x) => x.user_id);
    expect(members).toContain(a);
    expect(members).not.toContain(b);

    const id2 = await signature({ hostJoin: 'none' }, { hostGroupId: g });
    await h.call('POST', `/api/campaigns/${id2}/participate`, { ...on(b, APPLY_DAY), body: { answers: {}, consents: { delivery: true }, joinHost: true } });
    expect(await h.db.first('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', g, b)).toBeNull();
    const id3 = await signature({ hostJoin: 'auto' }, { hostGroupId: g });
    await h.call('POST', `/api/campaigns/${id3}/participate`, { ...on(b, APPLY_DAY), body: { answers: {}, consents: { delivery: true } } });
    expect(await h.db.first('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', g, b)).not.toBeNull();
  });

  test('campaign detail gives my signature order and referred count', async () => {
    const { h, signature } = await setup();
    const id = await signature();
    const [a, b, c] = [await user(h, '가', '서울'), await user(h, '나', '서울'), await user(h, '다', '서울')];
    const sign = (u: string, extra: Record<string, unknown> = {}) => h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: { delivery: true }, ...extra } });
    await sign(a);
    await sign(b, { sharedBy: a });
    await sign(c, { sharedBy: a });
    const mine = async (u: string) => (await (await h.call('GET', `/api/campaigns/${id}`, on(u, APPLY_DAY))).json()).myParticipation;
    expect(await mine(a)).toMatchObject({ signatureNo: 1, referredCount: 2 });
    expect(await mine(c)).toMatchObject({ signatureNo: 3, referredCount: 0 });
  });

  test('signature needs delivery consent; cancel before close only', async () => {
    const { h, signature } = await setup();
    const id = await signature();
    const a = await user(h, '가', '서울');
    expect((await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(a, APPLY_DAY), body: { answers: {}, consents: {} } })).status).toBe(400);
    const p = (await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(a, APPLY_DAY), body: { answers: {}, consents: { delivery: true } } })).json()).participation;
    expect(p.signatureNo).toBe(1);
    expect((await h.call('POST', `/api/participations/${p.id}/cancel`, on(a, '2027-03-01'))).status).toBe(409);
    const c = await h.call('POST', `/api/participations/${p.id}/cancel`, on(a, '2027-02-01'));
    expect((await c.json()).participation.state).toBe('cancelled');
    // signing again after cancelling is allowed
    expect((await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(a, APPLY_DAY), body: { answers: {}, consents: { delivery: true } } })).status).toBe(201);
  });

  test('regional counts group under 10', async () => {
    const { h, signature } = await setup();
    const id = await signature();
    const sign = async (nick: string, sido: string) => {
      const u = await user(h, nick, sido);
      expect((await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: { delivery: true } } })).status).toBe(201);
    };
    for (let i = 0; i < 10; i++) await sign(`서울${i}`, '서울');
    for (let i = 0; i < 3; i++) await sign(`부산${i}`, '부산');
    for (let i = 0; i < 2; i++) await sign(`대구${i}`, '대구');
    const a = await (await h.call('GET', `/api/aggregates/signature/${id}`, on(await user(h, '구경'), APPLY_DAY))).json();
    expect(a).toEqual({ count: 15, byRegion: [{ name: '서울', n: 10 }], other: { regions: 2, n: 5 } });
  });
});

describe('pause / quit / checklist', () => {
  test('pause once per participation, 7 days from my date', async () => {
    const { h, practice } = await setup();
    const id = await practice();
    const u = await user(h, '참가자');
    const p = (await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: {} } })).json()).participation.id;
    const r = await h.call('POST', `/api/participations/${p}/pause`, on(u, '2027-02-12'));
    expect(r.status).toBe(200);
    expect((await r.json()).participation).toMatchObject({ pausedFrom: '2027-02-12', pausedUntil: '2027-02-18' });
    const again = await h.call('POST', `/api/participations/${p}/pause`, on(u, '2027-02-20'));
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe('PAUSE_USED');
  });

  test('quit keeps records and blocks re-applying', async () => {
    const { h, practice } = await setup();
    const id = await practice();
    const u = await user(h, '참가자');
    const p = (await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: {} } })).json()).participation.id;
    await h.call('PUT', `/api/participations/${p}/records/2027-02-08`, { ...on(u, '2027-02-08'), body: { check: 'done' } });
    const q = await h.call('POST', `/api/participations/${p}/quit`, { ...on(u, '2027-02-10'), body: { reason: '바빠요' } });
    expect((await q.json()).participation.state).toBe('quit');
    expect(await h.db.first('SELECT 1 FROM records WHERE participation_id = ?', p)).not.toBeNull();
    expect((await h.call('PUT', `/api/participations/${p}/records/2027-02-10`, { ...on(u, '2027-02-10'), body: { check: 'done' } })).status).toBe(409);
  });

  test('checklist items complete from real actions and the done endpoint', async () => {
    const { h, practice, admin } = await setup();
    const id = await practice({ startPoint: { enabled: true, toolId: 'calculator' } });
    await h.call('PUT', `/api/campaigns/${id}/checklist`, { ...admin, body: [{ label: '안내 읽기', linkType: 'url', target: 'https://example.org' }] });
    const u = await user(h, '참가자');
    const m = (await (await h.call('POST', '/api/measurements', { ...on(u, APPLY_DAY), body: { answers: { car: 50 }, place: 'campaign', campaignId: id, kind: 'start' } })).json()).measurement.id;
    const p = (await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: {}, startMeasurementId: m } })).json()).participation.id;
    const done = async () => Object.fromEntries((await (await h.call('GET', `/api/campaigns/${id}`, on(u, APPLY_DAY))).json()).checklist.map((c: { key: string; done: boolean }) => [c.key, c.done]));
    let d = await done();
    expect(d.start_point).toBe(true);
    expect(d.reminder).toBe(false);
    expect(d.greet).toBe(false);
    expect((await h.call('PUT', `/api/participations/${p}/reminder`, { ...on(u, APPLY_DAY), body: { enabled: true, time: '21:00', channel: 'push' } })).status).toBe(200);
    await h.call('POST', `/api/boards/campaign/${id}/posts`, { ...on(u, APPLY_DAY), body: { title: '안녕하세요', body: '잘 부탁해요' } });
    const custom = Object.keys(d).find((k) => !['start_point', 'reminder', 'greet', 'first_mission'].includes(k))!;
    expect((await h.call('POST', `/api/campaigns/${id}/checklist/${custom}/done`, on(u, APPLY_DAY))).status).toBe(200);
    expect((await h.call('POST', `/api/campaigns/${id}/checklist/first_mission/done`, on(u, APPLY_DAY))).status).toBe(200);
    expect((await h.call('POST', `/api/campaigns/${id}/checklist/nope/done`, on(u, APPLY_DAY))).status).toBe(404);
    d = await done();
    expect(Object.values(d).every(Boolean)).toBe(true);
  });
});

describe('attendance', () => {
  afterEach(() => vi.useRealTimers());

  test('attendance code valid for current and previous minute only', async () => {
    const { h, offline, admin } = await setup();
    const id = await offline({ capacity: 5 });
    const u = await user(h, '참가자');
    const p = (await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: {} } })).json()).participation.id;
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.UTC(2026, 10, 1, 3, 0, 10);
    vi.setSystemTime(t0);
    const c = await h.call('GET', `/api/campaigns/${id}/attendance-code`, { headers: { ...admin.headers, 'X-Sim-Date': '2027-01-24', 'X-Sim-Time': '13:30' } });
    expect(c.status).toBe(200);
    const { code } = await c.json();
    expect(code).toMatch(/^\d{6}$/);
    expect(code).toBe(await attendanceCode(h.env.TOKEN_SECRET, id, Math.floor(t0 / 60000)));

    // non-staff cannot get the code
    expect((await h.call('GET', `/api/campaigns/${id}/attendance-code`, on(u, '2027-01-24'))).status).toBe(403);
    // two minutes later: stale
    vi.setSystemTime(t0 + 120_000);
    let r = await h.call('POST', `/api/campaigns/${id}/attend`, { ...on(u, '2027-01-24', '14:10'), body: { code } });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('BAD_CODE');
    // one minute later: previous minute still accepted, but only inside the window
    vi.setSystemTime(t0 + 60_000);
    r = await h.call('POST', `/api/campaigns/${id}/attend`, { ...on(u, '2027-01-24', '12:59'), body: { code } });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('ATTENDANCE_CLOSED');
    r = await h.call('POST', `/api/campaigns/${id}/attend`, { ...on(u, '2027-01-24', '13:00'), body: { code } });
    expect(r.status).toBe(200);
    expect(await h.db.first('SELECT 1 FROM attendance WHERE participation_id = ?', p)).not.toBeNull();
  });

  test('manual attend / unattend by staff', async () => {
    const { h, offline, admin } = await setup();
    const id = await offline({ capacity: 5, attendance: 'roster' });
    const u = await user(h, '참가자');
    const p = (await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: {} } })).json()).participation.id;
    expect((await h.call('POST', `/api/participations/${p}/attend-manual`, on(u, '2027-01-24'))).status).toBe(403);
    expect((await h.call('POST', `/api/participations/${p}/attend-manual`, { headers: { ...admin.headers, 'X-Sim-Date': '2027-01-24' } })).status).toBe(200);
    expect(await h.db.first<{ method: string }>('SELECT method FROM attendance WHERE participation_id = ?', p)).toEqual({ method: 'manual' });
    expect((await h.call('POST', `/api/participations/${p}/unattend`, admin)).status).toBe(200);
    expect(await h.db.first('SELECT 1 FROM attendance WHERE participation_id = ?', p)).toBeNull();
    void as;
  });

  test('attendedCount counts people incl. companions for applicants and staff only', async () => {
    const { h, offline, admin } = await setup();
    const id = await offline({ capacity: 10, attendance: 'roster' });
    const u = await user(h, '참가자');
    const other = await user(h, '구경꾼');
    const p = (await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: {}, companions: 2 } })).json()).participation.id;
    await h.call('POST', `/api/participations/${p}/attend-manual`, { headers: { ...admin.headers, 'X-Sim-Date': '2027-01-24' } });
    const get = async (who: Record<string, unknown>) => (await (await h.call('GET', `/api/campaigns/${id}`, who)).json()).counts.attendedCount;
    expect(await get(on(u, '2027-01-24'))).toBe(3);
    expect(await get(admin)).toBe(3);
    expect(await get(on(other, '2027-01-24'))).toBeUndefined();
  });
});

describe('my participations', () => {
  test('lists my campaigns with state, missions and requires login', async () => {
    const { h, practice } = await setup();
    const id = await practice();
    const u = await user(h, '내참여');
    const other = await user(h, '남');
    expect((await h.call('GET', '/api/me/participations', {})).status).toBe(401);
    expect((await (await h.call('GET', '/api/me/participations', on(u, '2027-01-10'))).json()).items).toHaveLength(0);
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, '2027-01-10'), body: { answers: {}, consents: {} } });
    const mine = await (await h.call('GET', '/api/me/participations', on(u, '2027-02-10'))).json();
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0].campaign.id).toBe(id);
    expect(mine.items[0].myParticipation.state).toBe('applied');
    expect(mine.items[0].missions.length).toBeGreaterThan(0);
    expect((await (await h.call('GET', '/api/me/participations', on(other, '2027-02-10'))).json()).items).toHaveLength(0);
  });
});

describe('my participations is light', () => {
  test('8 participations in one response with a bounded number of db calls', async () => {
    const { h, practice } = await setup();
    const u = await user(h, '많이참여');
    for (let i = 0; i < 8; i++) {
      const id = await practice();
      expect((await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, '2027-01-10'), body: { answers: {}, consents: {} } })).status).toBe(201);
    }
    let calls = 0;
    const db = h.db;
    const counted = {
      ...db,
      all: (...a: Parameters<typeof db.all>) => { calls++; return db.all(...a); },
      first: (...a: Parameters<typeof db.first>) => { calls++; return db.first(...a); },
      run: (...a: Parameters<typeof db.run>) => { calls++; return db.run(...a); },
    } as typeof db;
    const { handle } = await import('../src/index');
    const { issueToken } = await import('../src/auth');
    const token = await issueToken(h.env.TOKEN_SECRET, Date.now(), h.env.SIM_PASSCODE);
    const res = await handle(new Request('https://x.test/api/me/participations', { headers: { 'X-Sim-Token': token, 'X-User-Id': u, 'X-Sim-Date': '2027-02-10', 'X-Sim-Time': '12:00' } }), h.env, counted);
    const b = await res.json() as { items: Array<{ missions: unknown[] }> };
    expect(b.items).toHaveLength(8);
    expect(b.items[0].missions.length).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(8);
  });
});
