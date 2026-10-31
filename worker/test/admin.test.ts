import { describe, expect, test } from 'vitest';
import { as, on, setup, user } from './helpers/campaign';

const APPLY_DAY = '2027-01-10';

describe('admin', () => {
  test('research export only includes consented and hides nickname', async () => {
    const { h, admin, practice } = await setup();
    const id = await practice();
    const a = await user(h, '동의함');
    const b = await user(h, '동의안함');
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(a, APPLY_DAY), body: { answers: {}, consents: { research: true } } });
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(b, APPLY_DAY), body: { answers: {}, consents: {} } });
    const res = await h.call('GET', `/api/admin/campaigns/${id}/export?kind=research`, admin);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect([...buf.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const text = new TextDecoder().decode(buf);
    expect(text).toContain('일련번호');
    expect(text).not.toContain('활동명');
    expect(text).not.toContain('동의함');
    expect(text).not.toContain('동의안함');
    expect(text.trim().split(/\r?\n/)).toHaveLength(2);
    const ops = await (await h.call('GET', `/api/admin/campaigns/${id}/export?kind=ops`, admin)).text();
    expect(ops).toContain('동의함');
    expect(ops).toContain('동의안함');
    expect((await h.call('GET', `/api/admin/campaigns/${id}/export?kind=ops`, as(a))).status).toBe(403);
  });

  test('participants filter and home', async () => {
    const { h, admin, practice } = await setup();
    const id = await practice();
    const a = await user(h, '가');
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(a, APPLY_DAY), body: { answers: {}, consents: {} } });
    const adminOn = { headers: { ...admin.headers, 'X-Sim-Date': APPLY_DAY } };
    const r = await (await h.call('GET', `/api/admin/campaigns/${id}/participants?filter=no_start`, adminOn)).json();
    expect(r.items).toHaveLength(1);
    expect(r.counts.noStart).toBe(1);
    const home = await (await h.call('GET', '/api/admin/home', adminOn)).json();
    expect(home.status.users).toBe(2);
    expect(home.campaigns).toHaveLength(1);
  });

  test('raising offline capacity promotes the waitlist', async () => {
    const { h, admin, offline } = await setup();
    const id = await offline({ capacity: 1 });
    const a = await user(h, '가');
    const b = await user(h, '나');
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(a, APPLY_DAY), body: { answers: {}, consents: {} } });
    const rb = await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(b, APPLY_DAY), body: { answers: {}, consents: {} } })).json();
    expect(rb.waitlisted).toBe(true);
    const put = await h.call('PUT', `/api/campaigns/${id}`, { ...admin, body: { settings: { capacity: 2 } } });
    expect(put.status).toBe(200);
    const st = await h.db.first<{ state: string }>('SELECT state FROM participations WHERE user_id = ? AND campaign_id = ?', b, id);
    expect(st!.state).toBe('applied');
    const n = await (await h.call('GET', '/api/notifications', as(b))).json();
    expect(n.items.some((x: { kind: string }) => x.kind === 'waitlist_confirmed')).toBe(true);
  });

  test('reports hide + notify, users restrict, admin groups', async () => {
    const { h, admin, group } = await setup();
    const owner = await user(h, '모임장');
    const rep = await user(h, '신고자');
    const gid = await group(owner);
    await h.call('POST', `/api/groups/${gid}/join`, { ...as(rep), body: {} });
    const post = await (await h.call('POST', `/api/boards/group/${gid}/posts`, { ...as(owner), body: { title: '문제글', body: '내용', category: '자유' } })).json();
    const rr = await (await h.call('POST', '/api/reports', { ...as(rep), body: { targetType: 'post', targetId: post.id, reason: '광고' } })).json();
    const res = await h.call('POST', `/api/admin/reports/${rr.id}`, { ...admin, body: { action: 'hide', reason: '광고성', notify: true } });
    expect(res.status).toBe(200);
    expect((await h.db.first<{ hidden: number }>('SELECT hidden FROM posts WHERE id = ?', post.id))!.hidden).toBe(1);
    expect((await (await h.call('GET', '/api/notifications', as(owner))).json()).items.some((x: { kind: string }) => x.kind === 'report_hidden')).toBe(true);

    expect((await h.call('POST', `/api/admin/users/${rep}/restrict`, { ...admin, body: { restricted: true } })).status).toBe(200);
    const blocked = await h.call('POST', `/api/boards/group/${gid}/posts`, { ...as(rep), body: { title: 't', body: 'b', category: '자유' } });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe('RESTRICTED');
    expect((await h.call('GET', '/api/admin/users?q=신고', admin)).status).toBe(200);
    const groups = await (await h.call('GET', '/api/admin/groups', admin)).json();
    expect(groups.items[0].memberCount).toBe(2);
  });

  test('reset requires passcode', async () => {
    const { h, admin } = await setup();
    const u = await user(h, '일반');
    expect((await h.call('POST', '/api/sim/reset', { ...as(u), body: { passcode: 'test-pass' } })).status).toBe(403);
    const bad = await h.call('POST', '/api/sim/reset', { ...admin, body: { passcode: 'nope' } });
    expect(bad.status).toBe(401);
    expect((await h.db.first<{ n: number }>('SELECT COUNT(*) n FROM users'))!.n).toBe(2);
    const exp = await (await h.call('GET', '/api/sim/export', admin)).json();
    expect(exp.tables.users).toHaveLength(2);
    const ok = await h.call('POST', '/api/sim/reset', { ...admin, body: { passcode: 'test-pass' } });
    expect(ok.status).toBe(200);
    expect((await h.db.first<{ n: number }>('SELECT COUNT(*) n FROM users'))!.n).toBe(0);
    const log = await h.db.all<{ action: string }>('SELECT action FROM audit_log');
    expect(log.map((l) => l.action)).toEqual(['sim_reset']);
    expect((await h.db.first<{ n: number }>('SELECT COUNT(*) n FROM request_counts'))!.n).toBeGreaterThan(0);
  });
});
