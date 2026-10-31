import { describe, expect, test } from 'vitest';
import { todayReal } from '@shared/date';
import { harness } from './helpers/client';

describe('daily cap', () => {
  test('daily cap blocks writes over 80000', async () => {
    const h = harness();
    await h.db.run('INSERT INTO request_counts (day, n) VALUES (?, ?)', todayReal(), 80000);
    const post = await h.call('POST', '/api/users', { body: { nickname: '막힘' } });
    expect(post.status).toBe(503);
    expect((await post.json()).error.code).toBe('DAILY_CAP');
    const get = await h.call('GET', '/api/users');
    expect(get.status).toBe(200);
  });

  test('unauthenticated requests do not increment the counter', async () => {
    const h = harness();
    await h.call('GET', '/api/users', { token: null });
    await h.call('POST', '/api/enter', { body: { passcode: 'x' }, token: null });
    await h.call('GET', '/api/users', { token: 'forged.token' });
    const row = await h.db.first<{ n: number }>('SELECT n FROM request_counts WHERE day = ?', todayReal());
    expect(row).toBeNull();
  });

  test('every authenticated request is counted', async () => {
    const h = harness();
    await h.call('GET', '/api/users');
    await h.call('GET', '/api/users');
    const row = await h.db.first<{ n: number }>('SELECT n FROM request_counts WHERE day = ?', todayReal());
    expect(row?.n).toBe(2);
  });
});
