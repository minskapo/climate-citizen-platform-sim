import { describe, expect, test } from 'vitest';
import { harness, type Harness } from './helpers/client';

async function user(h: Harness, nickname: string) {
  return (await (await h.call('POST', '/api/users', { body: { nickname, consents: { terms: true } } })).json()).id as string;
}
const as = (id: string, extra: Record<string, string> = {}) => ({ headers: { 'X-User-Id': id, ...extra } });
async function setup(joinPolicy = 'open') {
  const h = harness();
  const owner = await user(h, '모임장'), m = await user(h, '멤버');
  const g = (await (await h.call('POST', '/api/groups', { ...as(owner), body: { name: '모임', sido: '서울', joinPolicy } })).json()).id as string;
  if (joinPolicy === 'open') await h.call('POST', `/api/groups/${g}/join`, as(m));
  return { h, owner, m, g };
}
const post = (h: Harness, g: string, uid: string, body: Record<string, unknown>, extra = {}) =>
  h.call('POST', `/api/boards/group/${g}/posts`, { ...as(uid, extra), body: { category: '자유', title: '제목', body: '내용', ...body } });

describe('posts', () => {
  test('notice category requires staff', async () => {
    const { h, owner, m, g } = await setup();
    expect((await post(h, g, m, { category: '공지' })).status).toBe(403);
    expect((await post(h, g, owner, { category: '공지' })).status).toBe(201);
  });

  test('post with oversized attachment is rejected atomically', async () => {
    const { h, m, g } = await setup();
    const big = Buffer.alloc(1_200_000, 1).toString('base64');
    const ok = Buffer.from('hello').toString('base64');
    const r = await post(h, g, m, { attachments: [{ name: 'a.txt', mime: 'text/plain', dataBase64: ok }, { name: 'b.bin', mime: 'application/octet-stream', dataBase64: big }] });
    expect(r.status).toBe(413);
    expect((await r.json()).error.code).toBe('FILE_TOO_LARGE');
    expect((await h.db.first<{ n: number }>('SELECT COUNT(*) n FROM posts'))!.n).toBe(0);
    expect((await h.db.first<{ n: number }>('SELECT COUNT(*) n FROM files'))!.n).toBe(0);
  });

  test('attachment round trip, view count, comments, like', async () => {
    const { h, m, g } = await setup();
    const created = await (await post(h, g, m, { attachments: [{ name: 'a.txt', mime: 'text/plain', dataBase64: Buffer.from('hello').toString('base64') }] })).json();
    const detail = await (await h.call('GET', `/api/posts/${created.id}`, as(m))).json();
    expect(detail.attachments).toHaveLength(1);
    const f = await h.call('GET', `/api/files/${detail.attachments[0].id}`, as(m));
    expect(await f.text()).toBe('hello');
    await h.call('POST', `/api/posts/${created.id}/comments`, { ...as(m), body: { body: '댓글' } });
    expect((await (await h.call('POST', `/api/posts/${created.id}/like`, as(m))).json()).likeCount).toBe(1);
    const d2 = await (await h.call('GET', `/api/posts/${created.id}`, as(m))).json();
    expect(d2.viewCount).toBe(2);
    expect(d2.comments).toHaveLength(1);
  });

  test('hidden posts visible only to author, staff, admin', async () => {
    const { h, owner, m, g } = await setup();
    const other = await user(h, '남');
    await h.call('POST', `/api/groups/${g}/join`, as(other));
    const p = await (await post(h, g, m, {})).json();
    expect((await h.call('POST', `/api/posts/${p.id}/hide`, as(other))).status).toBe(403);
    expect((await h.call('POST', `/api/posts/${p.id}/hide`, as(owner))).status).toBe(200);
    expect((await h.call('GET', `/api/posts/${p.id}`, as(other))).status).toBe(404);
    expect((await h.call('GET', `/api/posts/${p.id}`, as(m))).status).toBe(200);
    expect((await h.call('GET', `/api/posts/${p.id}`, as(owner))).status).toBe(200);
    expect((await h.call('GET', `/api/posts/${p.id}`, as(other, { 'X-Role': 'admin' }))).status).toBe(200);
    expect((await (await h.call('GET', `/api/boards/group/${g}/posts`, as(other))).json()).items).toHaveLength(0);
  });

  test('pinned first; list shape', async () => {
    const { h, owner, m, g } = await setup();
    const a = await (await post(h, g, m, { title: 'a' })).json();
    await post(h, g, m, { title: 'b' });
    await h.call('POST', `/api/posts/${a.id}/pin`, as(owner));
    const l = await (await h.call('GET', `/api/boards/group/${g}/posts?q=${encodeURIComponent('제목')}`, as(m))).json();
    expect(l.nextCursor).toBeNull();
    const all = await (await h.call('GET', `/api/boards/group/${g}/posts`, as(m))).json();
    expect(all.items[0].id).toBe(a.id);
  });

  test('campaign board needs participation', async () => {
    const { h, m } = await setup();
    await h.db.run("INSERT INTO campaigns (id, created_at, type, title, schedule_json) VALUES ('c1','t','practice','x','{}')");
    expect((await h.call('GET', '/api/boards/campaign/c1/posts', as(m))).status).toBe(403);
    await h.db.run("INSERT INTO participations (id, created_at, campaign_id, user_id) VALUES ('p1','t','c1',?)", m);
    expect((await h.call('GET', '/api/boards/campaign/c1/posts', as(m))).status).toBe(200);
    const r = await h.call('POST', '/api/boards/campaign/c1/posts', { ...as(m), body: { category: '자유', title: 't', body: 'b', attachments: [{ name: 'a', mime: 'text/plain', dataBase64: 'aGk=' }] } });
    expect(r.status).toBe(201);
    const fid = (await (await h.call('GET', `/api/posts/${(await r.json()).id}`, as(m))).json()).attachments[0].id;
    const other = await user(h, '외부');
    expect((await h.call('GET', `/api/files/${fid}`, as(other))).status).toBe(403);
    expect((await h.call('GET', `/api/files/${fid}`, as(other, { 'X-Role': 'admin' }))).status).toBe(200);
  });

  test('popular posts exclude private groups', async () => {
    const pub = await setup('open');
    const { h } = pub;
    const priv = (await (await h.call('POST', '/api/groups', { ...as(pub.owner), body: { name: '비밀', joinPolicy: 'private' } })).json()).id as string;
    await post(h, priv, pub.owner, { title: '비공개글' });
    const a = await (await post(h, pub.g, pub.m, { title: '인기' })).json();
    await post(h, pub.g, pub.m, { title: '조용' });
    await h.call('POST', `/api/posts/${a.id}/comments`, { ...as(pub.m), body: { body: 'c' } });
    const r = await (await h.call('GET', '/api/popular?days=7&limit=6', as(pub.m))).json();
    expect(r.items.map((i: { title: string }) => i.title)).toEqual(['인기', '조용']);
    expect(r.items[0].score).toBe(3);
    await h.call('POST', `/api/posts/${a.id}/like`, as(pub.m));
    expect((await (await h.call('GET', '/api/popular', as(pub.m))).json()).items[0].likeCount).toBe(1);
  });

  test('reports', async () => {
    const { h, m, g } = await setup();
    const p = await (await post(h, g, m, {})).json();
    const body = { targetType: 'post', targetId: p.id, reason: '광고' };
    expect((await h.call('POST', '/api/reports', { ...as(m), body })).status).toBe(201);
    expect((await h.call('POST', '/api/reports', { ...as(m), body })).status).toBe(409);
  });

  test('files: campaign-exclusive standalone files and content-type hardening', async () => {
    const { h, m, g } = await setup();
    const other = await user(h, '외부');
    await h.db.run("INSERT INTO campaigns (id, created_at, type, title, host_group_id, schedule_json) VALUES ('c1','t','practice','x',?, '{}')", g);
    await h.db.run("INSERT INTO files (id, created_at, mime, bytes, data) VALUES ('f1','t','text/html',2,x'3c62')");
    await h.db.run("INSERT INTO files (id, created_at, mime, bytes, data) VALUES ('f2','t','image/png',2,x'8950')");
    await h.db.run("INSERT INTO campaign_files (id, created_at, campaign_id, file_id, exclusive) VALUES ('a','t','c1','f1',1)");
    expect((await h.call('GET', '/api/files/f1', as(other))).status).toBe(403);
    await h.db.run("INSERT INTO participations (id, created_at, campaign_id, user_id) VALUES ('p1','t','c1',?)", other);
    const ok = await h.call('GET', '/api/files/f1', as(other));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-disposition')).toBe('attachment');
    expect(ok.headers.get('content-type')).toBe('application/octet-stream');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    const open = await h.call('GET', '/api/files/f2', as(m));
    expect(open.status).toBe(200);
    expect(open.headers.get('content-disposition')).toBe('inline');
  });
});
