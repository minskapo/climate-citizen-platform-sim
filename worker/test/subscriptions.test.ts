import { describe, expect, test } from 'vitest';
import { as, on, setup, user } from './helpers/campaign';

describe('campaign subscriptions (모집 예정 알림 받기)', () => {
  test('subscribe persists, counts, unsubscribes and notifies once when recruiting opens', async () => {
    const { h, practice } = await setup();
    const id = await practice();
    const u = await user(h, '구독자');
    const v = await user(h, '구경꾼');
    const SCHEDULED_DAY = '2027-01-01';
    expect((await h.call('POST', `/api/campaigns/${id}/subscribe`, on(u, SCHEDULED_DAY))).status).toBe(200);
    expect((await h.call('POST', `/api/campaigns/${id}/subscribe`, on(u, SCHEDULED_DAY))).status).toBe(200); // idempotent
    let d = await (await h.call('GET', `/api/campaigns/${id}`, on(u, SCHEDULED_DAY))).json();
    expect(d.subscribed).toBe(true);
    expect(d.counts.subscribers).toBe(1);
    d = await (await h.call('GET', `/api/campaigns/${id}`, on(v, SCHEDULED_DAY))).json();
    expect(d.subscribed).toBe(false);
    const list = await (await h.call('GET', '/api/campaigns', on(v, SCHEDULED_DAY))).json();
    expect(list.items[0].subscriberCount).toBe(1);

    // still scheduled: nothing
    let r = await (await h.call('POST', '/api/notifications/sync', on(u, SCHEDULED_DAY))).json();
    expect(r.unread).toBe(0);
    // recruiting at the caller's date: once
    r = await (await h.call('POST', '/api/notifications/sync', on(u, '2027-01-05'))).json();
    expect(r.unread).toBe(1);
    r = await (await h.call('POST', '/api/notifications/sync', on(u, '2027-01-06'))).json();
    expect(r.unread).toBe(1);
    const n = await (await h.call('GET', '/api/notifications', as(u))).json();
    expect(n.items[0].kind).toBe('recruit_open');
    expect(n.items[0].link).toBe(`/campaigns/${id}`);

    expect((await h.call('DELETE', `/api/campaigns/${id}/subscribe`, on(u, SCHEDULED_DAY))).status).toBe(200);
    d = await (await h.call('GET', `/api/campaigns/${id}`, on(u, SCHEDULED_DAY))).json();
    expect(d.subscribed).toBe(false);
    expect(d.counts.subscribers).toBe(0);
  });

  test('requires a user and a visible campaign', async () => {
    const { h, practice } = await setup();
    const id = await practice();
    expect((await h.call('POST', `/api/campaigns/${id}/subscribe`, {})).status).toBe(401);
    const u = await user(h, '누구');
    expect((await h.call('POST', '/api/campaigns/nope/subscribe', as(u))).status).toBe(404);
  });
});
