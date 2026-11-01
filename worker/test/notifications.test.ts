import { describe, expect, test } from 'vitest';
import { as, on, setup, user } from './helpers/campaign';

const APPLY_DAY = '2027-01-10';
const body = { answers: {}, consents: {} };

describe('notifications', () => {
  test('sync creates due notifications once', async () => {
    const { h, practice } = await setup();
    const id = await practice();
    const u = await user(h, '참가자');
    expect((await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body })).status).toBe(201);
    let r = await (await h.call('POST', '/api/notifications/sync', on(u, '2027-02-08', '19:00'))).json();
    expect(r.unread).toBe(0); // before the reminder time
    r = await (await h.call('POST', '/api/notifications/sync', on(u, '2027-02-08', '21:00'))).json();
    expect(r.unread).toBe(1);
    r = await (await h.call('POST', '/api/notifications/sync', on(u, '2027-02-08', '22:00'))).json();
    expect(r.unread).toBe(1);
    const list = await (await h.call('GET', '/api/notifications?unread=1', as(u))).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].kind).toBe('mission_reminder');
    const read = await (await h.call('POST', '/api/notifications/read', { ...as(u), body: { ids: [list.items[0].id] } })).json();
    expect(read.unread).toBe(0);
  });

  test('offline day-before reminder', async () => {
    const { h, offline } = await setup();
    const id = await offline({ capacity: 5 });
    const u = await user(h, '참가자');
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body });
    const r = await (await h.call('POST', '/api/notifications/sync', on(u, '2027-01-23', '18:30'))).json();
    expect(r.unread).toBe(1);
  });

  test('comment on my post notifies the author', async () => {
    const { h, group } = await setup();
    const owner = await user(h, '모임장');
    const other = await user(h, '댓글러');
    const gid = await group(owner);
    await h.call('POST', `/api/groups/${gid}/join`, { ...as(other), body: {} });
    const post = await (await h.call('POST', `/api/boards/group/${gid}/posts`, { ...as(owner), body: { title: '안녕', body: '내용', category: '자유' } })).json();
    expect((await h.call('POST', `/api/posts/${post.id}/comments`, { ...as(other), body: { body: '좋아요' } })).status).toBe(201);
    await h.call('POST', `/api/posts/${post.id}/comments`, { ...as(owner), body: { body: '내 글에 내가' } });
    const n = await (await h.call('GET', '/api/notifications', as(owner))).json();
    expect(n.items.filter((x: { kind: string }) => x.kind === 'comment')).toHaveLength(1);
  });

  test('signature goal 50% notifies signers once', async () => {
    const { h, signature } = await setup();
    const id = await signature({ goal: 4 });
    const us = await Promise.all(['가', '나', '다'].map((n) => user(h, n)));
    for (const u of us) {
      const r = await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: { delivery: true } } });
      expect(r.status).toBe(201);
    }
    const first = await (await h.call('GET', '/api/notifications', as(us[0]))).json();
    expect(first.items.filter((x: { kind: string }) => x.kind === 'goal_reached')).toHaveLength(1);
    const third = await (await h.call('GET', '/api/notifications', as(us[2]))).json();
    expect(third.items.filter((x: { kind: string }) => x.kind === 'goal_reached')).toHaveLength(0);
  });

  test('delivery result and notice reach signers; collab reply reaches author', async () => {
    const { h, admin, signature } = await setup();
    const id = await signature();
    const u = await user(h, '서명자');
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body: { answers: {}, consents: { delivery: true } } });
    expect((await h.call('POST', `/api/campaigns/${id}/delivery`, { ...admin, body: { summary: '전달했어요', councils: ['마포구의회'] } })).status).toBe(201);
    const nr = await (await h.call('POST', `/api/campaigns/${id}/notices`, { ...admin, body: { target: 'all', title: '안내', body: '내용', alsoBoard: true } })).json();
    expect(nr.sent).toBe(1);
    expect(nr.postId).toBeTruthy();
    const kinds = (await (await h.call('GET', '/api/notifications', as(u))).json()).items.map((x: { kind: string }) => x.kind).sort();
    expect(kinds).toEqual(['delivery_result', 'notice']);

    const c = await (await h.call('POST', '/api/collab', { ...as(u), body: { title: '제안', idea: '같이 해요', period: '한 달', size: '30명' } })).json();
    expect(Math.abs(Date.parse(c.dueAt) - Date.now() - 24 * 3600 * 1000)).toBeLessThan(5000);
    expect((await h.call('POST', `/api/admin/collab/${c.id}/reply`, { ...admin, body: { body: '좋아요' } })).status).toBe(201);
    const after = await (await h.call('GET', '/api/notifications', as(u))).json();
    expect(after.items.some((x: { kind: string }) => x.kind === 'collab_reply')).toBe(true);
  });

  test('collab due_at is +24h and draft is prefilled', async () => {
    const { h, admin, group } = await setup();
    const owner = await user(h, '모임장');
    const gid = await group(owner);
    const r = await h.call('POST', '/api/collab', { ...as(owner), body: { title: '협업', idea: '아이디어', period: '', size: '', groupId: gid } });
    expect(r.status).toBe(201);
    const b = await r.json();
    expect(Math.abs(Date.parse(b.dueAt) - Date.now() - 24 * 3600 * 1000)).toBeLessThan(5000);
    const d = await (await h.call('POST', `/api/admin/collab/${b.id}/draft`, { ...admin, body: { type: 'practice' } })).json();
    const row = await h.db.first<{ title: string; host_group_id: string }>('SELECT title, host_group_id FROM campaigns WHERE id = ?', d.campaignId);
    expect(row!.title).toBe('협업');
    expect(row!.host_group_id).toBe(gid);
  });
});

describe('reminder default time', () => {
  test('falls back to my account reminderTime when no per-campaign time', async () => {
    const { h, practice } = await setup();
    const id = await practice();
    const u = await user(h, '시각설정');
    await h.call('PATCH', '/api/me', { ...as(u), body: { settings: { reminderTime: '21:30' } } });
    await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, APPLY_DAY), body });
    let r = await (await h.call('POST', '/api/notifications/sync', on(u, '2027-02-08', '21:00'))).json();
    expect(r.unread).toBe(0);
    r = await (await h.call('POST', '/api/notifications/sync', on(u, '2027-02-08', '21:40'))).json();
    expect(r.unread).toBe(1);
  });
});
