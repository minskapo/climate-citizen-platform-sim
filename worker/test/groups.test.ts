import { describe, expect, test } from 'vitest';
import { harness, type Harness } from './helpers/client';

async function user(h: Harness, nickname: string) {
  return (await (await h.call('POST', '/api/users', { body: { nickname, consents: { terms: true } } })).json()).id as string;
}
const as = (id: string, extra: Record<string, string> = {}) => ({ headers: { 'X-User-Id': id, ...extra } });
async function group(h: Harness, owner: string, over: Record<string, unknown> = {}) {
  const r = await h.call('POST', '/api/groups', { ...as(owner), body: { name: '원주 모임', description: '소개', sido: '강원', joinPolicy: 'open', chatLink: 'https://open.kakao.com/x', ...over } });
  expect(r.status).toBe(201);
  return (await r.json()).id as string;
}

describe('groups', () => {
  test('approval group: join → pending, staff approves → member', async () => {
    const h = harness();
    const owner = await user(h, '모임장'), u = await user(h, '신청자');
    const g = await group(h, owner, { joinPolicy: 'approval' });
    expect((await (await h.call('POST', `/api/groups/${g}/join`, as(u))).json()).role).toBe('pending');
    expect((await h.call('POST', `/api/groups/${g}/members/${u}`, { ...as(u), body: { action: 'approve' } })).status).toBe(403);
    expect((await h.call('POST', `/api/groups/${g}/members/${u}`, { ...as(owner), body: { action: 'approve' } })).status).toBe(200);
    expect((await (await h.call('GET', `/api/groups/${g}`, as(u))).json()).myRole).toBe('member');
  });

  test('chat link hidden from non-members', async () => {
    const h = harness();
    const owner = await user(h, '모임장'), other = await user(h, '구경꾼');
    const g = await group(h, owner);
    expect((await (await h.call('GET', `/api/groups/${g}`, as(other))).json()).chatLink).toBeUndefined();
    expect((await (await h.call('GET', `/api/groups/${g}`, as(owner))).json()).chatLink).toContain('kakao');
    const list = await (await h.call('GET', '/api/groups?region=' + encodeURIComponent('강원'), as(other))).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].chatLink).toBeUndefined();
    expect(list.nextCursor).toBeNull();
  });

  test('private group: name only, join needs invite', async () => {
    const h = harness();
    const owner = await user(h, '모임장'), u = await user(h, '손님');
    const g = await group(h, owner, { joinPolicy: 'private' });
    const view = await (await h.call('GET', `/api/groups/${g}`, as(u))).json();
    expect(view.name).toBe('원주 모임');
    expect(view.description).toBeUndefined();
    expect(view.memberCount).toBeUndefined();
    expect((await h.call('POST', `/api/groups/${g}/join`, { ...as(u), body: {} })).status).toBe(403);
    const inv = await (await h.call('POST', `/api/groups/${g}/invites`, as(owner))).json();
    expect(Date.parse(inv.expiresAt)).toBeGreaterThan(Date.now() + 6 * 86400_000);
    expect((await h.call('POST', `/api/groups/${g}/join`, { ...as(u), body: { invite: inv.code } })).status).toBe(201);
  });

  test('simulated staff role grants staff rights only for chosen group', async () => {
    const h = harness();
    const owner = await user(h, '모임장'), u = await user(h, '체험');
    const g1 = await group(h, owner), g2 = await group(h, owner, { name: '다른 모임' });
    const hdr = as(u, { 'X-Role': 'staff', 'X-Staff-Group': g1 });
    expect((await h.call('PATCH', `/api/groups/${g1}`, { ...hdr, body: { chatLink: 'https://a' } })).status).toBe(200);
    expect((await h.call('PATCH', `/api/groups/${g2}`, { ...hdr, body: { chatLink: 'https://a' } })).status).toBe(403);
    expect((await h.call('POST', `/api/groups/${g1}/close`, { ...hdr, body: { confirmName: '원주 모임' } })).status).toBe(403);
  });

  test('transfer needs acceptance; close blocked while hosting recruiting campaign', async () => {
    const h = harness();
    const owner = await user(h, '모임장'), s = await user(h, '운영진');
    const g = await group(h, owner);
    await h.call('POST', `/api/groups/${g}/join`, as(s));
    await h.call('POST', `/api/groups/${g}/members/${s}`, { ...as(owner), body: { action: 'staff' } });
    expect((await h.call('POST', `/api/groups/${g}/transfer`, { ...as(owner), body: { toUserId: s } })).status).toBe(201);
    expect((await h.call('POST', `/api/groups/${g}/transfer/accept`, as(owner))).status).toBe(403);
    expect((await h.call('POST', `/api/groups/${g}/transfer/accept`, as(s))).status).toBe(200);
    expect((await (await h.call('GET', `/api/groups/${g}`, as(s))).json()).myRole).toBe('owner');

    const sched = { recruitStart: '2026-01-01', recruitEnd: '2099-12-31' };
    await h.db.run("INSERT INTO campaigns (id, created_at, type, title, host_group_id, schedule_json, publish) VALUES ('c1','t','signature','서명','" + g + "', ?, 'now')", JSON.stringify(sched));
    const r = await h.call('POST', `/api/groups/${g}/close`, { ...as(s), body: { confirmName: '원주 모임' } });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('HAS_ACTIVE_CAMPAIGN');
    await h.db.run('DELETE FROM campaigns');
    expect((await h.call('POST', `/api/groups/${g}/close`, { ...as(s), body: { confirmName: 'x' } })).status).toBe(400);
    expect((await h.call('POST', `/api/groups/${g}/close`, { ...as(s), body: { confirmName: '원주 모임' } })).status).toBe(200);
    expect((await h.call('POST', `/api/groups/${g}/join`, as(await user(h, '늦은')))).status).toBe(409);
  });

  test('transfer target leaving before accept -> 409, owner unchanged', async () => {
    const h = harness();
    const owner = await user(h, '모임장'), s = await user(h, '운영진');
    const g = await group(h, owner);
    await h.call('POST', `/api/groups/${g}/join`, as(s));
    await h.call('POST', `/api/groups/${g}/members/${s}`, { ...as(owner), body: { action: 'staff' } });
    await h.call('POST', `/api/groups/${g}/transfer`, { ...as(owner), body: { toUserId: s } });
    await h.call('POST', `/api/groups/${g}/leave`, as(s));
    expect((await h.db.first<{ transfer_to: string | null }>('SELECT transfer_to FROM groups WHERE id = ?', g))!.transfer_to).toBeNull();
    // stale request re-created directly, then target no longer a member
    await h.db.run("UPDATE groups SET transfer_to = ?, transfer_expires = '2999-01-01' WHERE id = ?", s, g);
    const r = await h.call('POST', `/api/groups/${g}/transfer/accept`, as(s));
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('TRANSFER_INVALID');
    expect((await (await h.call('GET', `/api/groups/${g}`, as(owner))).json()).myRole).toBe('owner');
  });

  test('closed group blocks mutations', async () => {
    const h = harness();
    const owner = await user(h, '모임장'), m = await user(h, '멤버');
    const g = await group(h, owner);
    await h.call('POST', `/api/groups/${g}/join`, as(m));
    const p = await (await h.call('POST', `/api/boards/group/${g}/posts`, { ...as(m), body: { category: '자유', title: 't', body: 'b' } })).json();
    await h.call('POST', `/api/groups/${g}/close`, { ...as(owner), body: { confirmName: '원주 모임' } });
    for (const [method, path, body] of [
      ['PATCH', `/api/groups/${g}`, { chatLink: 'x' }],
      ['POST', `/api/groups/${g}/invites`, undefined],
      ['POST', `/api/groups/${g}/members/${m}`, { action: 'kick' }],
      ['POST', `/api/groups/${g}/transfer`, { toUserId: m }],
      ['DELETE', `/api/posts/${p.id}`, undefined],
    ] as const) {
      const r = await h.call(method, path, { ...as(owner), body });
      expect([method, path, r.status]).toEqual([method, path, 409]);
    }
  });

  test('member list: staff only, pending first, nickname search', async () => {
    const h = harness();
    const owner = await user(h, '모임장'), u = await user(h, '신청자'), o = await user(h, '구경꾼');
    const g = await group(h, owner, { joinPolicy: 'approval' });
    await h.call('POST', `/api/groups/${g}/join`, as(u));
    expect((await h.call('GET', `/api/groups/${g}/members`, as(o))).status).toBe(403);
    const r = await (await h.call('GET', `/api/groups/${g}/members`, as(owner))).json();
    expect(r.items.map((m: { role: string }) => m.role)).toEqual(['pending', 'owner']);
    const q = await (await h.call('GET', `/api/groups/${g}/members?q=${encodeURIComponent('신청')}`, as(owner))).json();
    expect(q.items).toHaveLength(1);
  });
});
