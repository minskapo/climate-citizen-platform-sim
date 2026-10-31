import { describe, expect, test } from 'vitest';
import { harness } from './helpers/client';

const create = (h: ReturnType<typeof harness>, nickname: string) =>
  h.call('POST', '/api/users', { body: { nickname, sido: '서울특별시', sigungu: '마포구', consents: { terms: true } } });

describe('users', () => {
  test('nickname validation', async () => {
    const h = harness();
    const a = await create(h, '  햇빛부자 ');
    expect(a.status).toBe(201);
    expect((await a.json()).nickname).toBe('햇빛부자');
    const b = await create(h, '햇빛부자');
    expect(b.status).toBe(409);
    expect((await b.json()).error.code).toBe('NICKNAME_TAKEN');
    const c = await create(h, '   ');
    expect(c.status).toBe(400);
  });

  test('list with q and get/patch me', async () => {
    const h = harness();
    const u = await (await create(h, '바람이')).json();
    await create(h, '햇빛');
    const list = await (await h.call('GET', '/api/users?q=' + encodeURIComponent('바람'))).json();
    expect(list.map((x: { nickname: string }) => x.nickname)).toEqual(['바람이']);

    const hdr = { 'X-User-Id': u.id };
    const me = await (await h.call('GET', '/api/me', { headers: hdr })).json();
    expect(me.sigungu).toBe('마포구');
    expect((await h.call('GET', '/api/me')).status).toBe(401);

    const patched = await h.call('PATCH', '/api/me', { headers: hdr, body: { sigungu: '종로구' } });
    expect((await patched.json()).sigungu).toBe('종로구');
    const taken = await h.call('PATCH', '/api/me', { headers: hdr, body: { nickname: '햇빛' } });
    expect(taken.status).toBe(409);
  });
});
