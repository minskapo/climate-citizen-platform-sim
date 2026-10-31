import { describe, expect, test } from 'vitest';
import { as, setup, user } from './helpers/campaign';

const manifest = { permissions: ['record'], saveKeys: ['steps'], aggregateKeys: [{ key: 'steps', op: 'sum' }], startPoint: false };
const tool = { name: '걸음', slug: 'steps', kind: 'block', html: '<p>hi</p>', manifest };

type S = Awaited<ReturnType<typeof setup>>;

async function published(s: S) {
  const t = await (await s.h.call('POST', '/api/tools', { ...s.admin, body: tool })).json();
  expect((await s.h.call('POST', `/api/tools/${t.id}/versions/1/publish`, s.admin)).status).toBe(200);
  return t.id as string;
}

describe('tools', () => {
  test('validation: slug unique, html size, manifest, admin only', async () => {
    const { h, admin } = await setup();
    expect((await h.call('POST', '/api/tools', { ...admin, body: tool })).status).toBe(201);
    expect((await h.call('POST', '/api/tools', { ...admin, body: tool })).status).toBe(409);
    expect((await h.call('POST', '/api/tools', { ...admin, body: { ...tool, slug: 'big', html: 'x'.repeat(1024 * 1024 + 1) } })).status).toBe(413);
    expect((await h.call('POST', '/api/tools', { ...admin, body: { ...tool, slug: 'bad', manifest: { permissions: ['root'] } } })).status).toBe(400);
    const u = await user(h, '일반');
    expect((await h.call('POST', '/api/tools', { ...as(u), body: { ...tool, slug: 'x2' } })).status).toBe(403);
  });

  test('tool record rejects key outside manifest', async () => {
    const s = await setup();
    const id = await published(s);
    const u = await user(s.h, '사용자');
    expect((await s.h.call('POST', `/api/tools/${id}/records`, { ...as(u), body: { values: { secret: 1 } } })).status).toBe(400);
    expect((await s.h.call('POST', `/api/tools/${id}/records`, { ...as(u), body: { values: { steps: 100 } } })).status).toBe(201);
    const mine = await (await s.h.call('GET', `/api/tools/${id}/records/mine`, as(u))).json();
    expect(mine.items).toHaveLength(1);
  });

  test('preview records excluded from aggregates', async () => {
    const s = await setup();
    const { h, admin } = s;
    const id = await published(s);
    const u = await user(h, '사용자');
    await h.call('POST', `/api/tools/${id}/records`, { ...as(u), body: { values: { steps: 100 } } });
    const pv = await h.call('POST', `/api/tools/${id}/records`, { headers: { ...admin.headers, 'X-Preview': '1' }, body: { values: { steps: 900 } } });
    expect((await pv.json()).preview).toBe(true);
    const np = await (await h.call('POST', `/api/tools/${id}/records`, { headers: { ...as(u).headers, 'X-Preview': '1' }, body: { values: { steps: 5 } } })).json();
    expect(np.preview).toBe(false);
    const agg = await (await h.call('GET', `/api/aggregates/tool/${id}/steps`, as(u))).json();
    expect(agg.sum).toBe(105);
  });

  test('rollback republishes old version, only one published', async () => {
    const s = await setup();
    const { h, admin } = s;
    const id = await published(s);
    const v2 = await (await h.call('POST', `/api/tools/${id}/versions`, { ...admin, body: { html: '<p>v2</p>', manifest } })).json();
    expect(v2.version).toBe(2);
    await h.call('POST', `/api/tools/${id}/versions/2/publish`, admin);
    let pub = await (await h.call('GET', `/api/tools/${id}/published`, as(await user(h, '손님')))).json();
    expect(pub.html).toBe('<p>v2</p>');
    expect(pub.kind).toBe('block');
    expect((await h.call('POST', `/api/tools/${id}/rollback`, { ...admin, body: { toVersion: 1 } })).status).toBe(200);
    pub = await (await h.call('GET', '/api/tools/steps/published', as(await user(h, '손님2')))).json();
    expect(pub.html).toBe('<p>hi</p>');
    const n = await h.db.first<{ n: number }>("SELECT COUNT(*) n FROM tool_versions WHERE tool_id = ? AND status = 'published'", id);
    expect(n!.n).toBe(1);
  });

  test('exclusive tool: participants only', async () => {
    const s = await setup();
    const { h, admin } = s;
    const id = await published(s);
    const cid = await s.practice();
    expect((await h.call('PUT', `/api/campaigns/${cid}/tools`, { ...admin, body: [{ toolId: id, exclusive: true }] })).status).toBe(200);
    const u = await user(h, '외부인');
    expect((await h.call('GET', `/api/tools/${id}/published`, as(u))).status).toBe(403);
    expect((await h.call('GET', `/api/tools/${id}/published`, admin)).status).toBe(200);
  });
});
