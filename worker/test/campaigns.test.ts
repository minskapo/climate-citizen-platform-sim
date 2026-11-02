import { describe, expect, test } from 'vitest';
import { harness, type Harness } from './helpers/client';
import { defaultSettings, validateSettings } from '../src/campaignSettings';

async function user(h: Harness, nickname: string) {
  return (await (await h.call('POST', '/api/users', { body: { nickname, consents: { terms: true } } })).json()).id as string;
}
const as = (id: string, extra: Record<string, string> = {}) => ({ headers: { 'X-User-Id': id, ...extra } });

const SCHEDULE = { recruitStart: '2027-01-04', recruitStartTime: '10:00', recruitEnd: '2027-01-31', recruitEndTime: '23:59', runStart: '2027-02-08', runDays: 28 };
const WEEKLY = { recordEnabled: true, missionCycle: 'weekly', recordCycle: 'daily' };
const MISSIONS = [
  { round: 1, category: '이동', title: '출퇴근은 대중교통 · 자전거 · 걷기로', extraFields: [] },
  { round: 2, category: '먹거리', title: '하루 한 끼 채식, 남김 없이 먹기', extraFields: [] },
  { round: 3, category: '에너지', title: '대기전력 끄기, 난방 온도 1도 낮추기', extraFields: [] },
  { round: 4, category: '소비', title: '새로 사지 않기, 다회용품 챙기기', extraFields: ['photo'] },
];

async function setup() {
  const h = harness();
  const adminId = await user(h, '관리자');
  const admin = as(adminId, { 'X-Role': 'admin' });
  const create = async (body: Record<string, unknown>) => {
    const r = await h.call('POST', '/api/campaigns', { ...admin, body });
    expect(r.status).toBe(201);
    return (await r.json()).campaign.id as string;
  };
  const practice = async (over: Record<string, unknown> = {}) =>
    create({ type: 'practice', title: '새해 1.5도 한달살기', summary: '4주 동안 함께 실천해요.', schedule: SCHEDULE, settings: WEEKLY, ...over });
  const publish = (id: string, body: Record<string, unknown> = { mode: 'now' }) => h.call('POST', `/api/campaigns/${id}/publish`, { ...admin, body });
  const missions = (id: string, list: unknown[]) => h.call('PUT', `/api/campaigns/${id}/missions`, { ...admin, body: list });
  return { h, adminId, admin, create, practice, publish, missions };
}

describe('campaignSettings', () => {
  test('defaults validate for every type', () => {
    for (const t of ['practice', 'signature', 'offline'] as const) expect(validateSettings(t, defaultSettings(t))).toEqual({ ok: true });
  });
  test('rejects bad values with a field path', () => {
    expect(validateSettings('practice', { ...defaultSettings('practice'), recordCycle: 'hourly' })).toMatchObject({ ok: false, field: 'recordCycle' });
    expect(validateSettings('practice', { ...defaultSettings('practice'), recordFields: ['memo'] })).toMatchObject({ ok: false, field: 'recordFields' });
    expect(validateSettings('signature', { ...defaultSettings('signature'), fields: ['realname'] })).toMatchObject({ ok: false, field: 'fields' });
    const slots = { ...defaultSettings('offline').slots, event: 'middle' };
    expect(validateSettings('offline', { ...defaultSettings('offline'), slots })).toMatchObject({ ok: false, field: 'slots.event' });
  });
});

describe('campaigns', () => {
  test('non-admin cannot create campaign → 403', async () => {
    const { h } = await setup();
    const u = await user(h, '회원');
    expect((await h.call('POST', '/api/campaigns', { ...as(u, { 'X-Role': 'member' }), body: { type: 'practice' } })).status).toBe(403);
    expect((await h.call('POST', '/api/campaigns', { ...as(u, { 'X-Role': 'staff' }), body: { type: 'practice' } })).status).toBe(403);
  });

  test('campaign without host group shows host as 녹색전환연구소', async () => {
    const { h, admin, practice } = await setup();
    const id = await practice();
    const d = await (await h.call('GET', `/api/campaigns/${id}`, admin)).json();
    expect(d.campaign.host).toEqual({ type: 'igt', name: '녹색전환연구소' });
    expect(d.campaign.settings.hostLink).toBe('none');

    const owner = await user(h, '모임장');
    const g = (await (await h.call('POST', '/api/groups', { ...as(owner), body: { name: '온라인 1.5도 실천방', sido: '서울', joinPolicy: 'open' } })).json()).id;
    const r = await h.call('PUT', `/api/campaigns/${id}`, { ...admin, body: { hostGroupId: g } });
    expect(r.status).toBe(200);
    const d2 = await (await h.call('GET', `/api/campaigns/${id}`, admin)).json();
    expect(d2.campaign.host).toEqual({ type: 'group', id: g, name: '온라인 1.5도 실천방' });
    expect(d2.campaign.settings.hostLink).toBe('linked');
    expect((await h.call('PUT', `/api/campaigns/${id}`, { ...admin, body: { hostGroupId: 'nope' } })).status).toBe(400);
  });

  test('home hero resolves per viewer date: latest started hero wins', async () => {
    const { h, admin, practice, publish, missions } = await setup();
    const a = await practice({ title: 'A', schedule: { ...SCHEDULE, recruitStart: '2027-01-01', recruitStartTime: null } });
    const b = await practice({ title: 'B' }); // recruitStart 2027-01-04 10:00
    for (const id of [a, b]) expect((await missions(id, MISSIONS)).status).toBe(200);
    expect((await publish(a, { mode: 'now', hero: true })).status).toBe(200);
    expect((await publish(b, { mode: 'scheduled', hero: true, showUpcoming: true })).status).toBe(200);
    // publishing B does not clear A
    expect((await h.db.all<{ id: string }>('SELECT id FROM campaigns WHERE hero = 1 ORDER BY title')).map((r) => r.id)).toEqual([a, b]);
    const u = await user(h, '보는 사람');
    const hero = async (date: string, time: string) =>
      (await (await h.call('GET', '/api/campaigns/hero', as(u, { 'X-Sim-Date': date, 'X-Sim-Time': time }))).json()).campaign?.campaign.id ?? null;
    expect(await hero('2026-12-31', '12:00')).toBeNull();
    expect(await hero('2027-01-03', '12:00')).toBe(a);
    expect(await hero('2027-01-04', '09:59')).toBe(a);
    expect(await hero('2027-01-04', '10:00')).toBe(b);
    const list = await (await h.call('GET', '/api/campaigns?hero=1', as(u, { 'X-Sim-Date': '2027-01-03', 'X-Sim-Time': '12:00' }))).json();
    expect(list.items.map((c: { id: string }) => c.id)).toEqual([a]);
    // after B closes it drops out (A also closed by then → none)
    expect(await hero('2027-03-08', '12:00')).toBeNull();
    // heroEnabled and hero column stay in sync on PUT and on unpublish
    await h.call('PUT', `/api/campaigns/${b}`, { ...admin, body: { settings: { heroEnabled: false } } });
    expect((await h.db.first<{ hero: number }>('SELECT hero FROM campaigns WHERE id = ?', b))!.hero).toBe(0);
    await h.call('PUT', `/api/campaigns/${b}`, { ...admin, body: { settings: { heroEnabled: true } } });
    expect((await h.db.first<{ hero: number }>('SELECT hero FROM campaigns WHERE id = ?', b))!.hero).toBe(1);
    await publish(a, { mode: 'draft' });
    const da = await (await h.call('GET', `/api/campaigns/${a}`, admin)).json();
    expect(da.campaign.hero).toBe(false);
    expect(da.campaign.settings.heroEnabled).toBe(false);
  });

  test('clone drops absolute dates of dated missions', async () => {
    const { h, admin, practice, missions } = await setup();
    const id = await practice({ settings: { recordEnabled: true, missionCycle: 'dated', recordCycle: 'once_end' } });
    expect((await missions(id, [{ date: '2027-02-10', category: '행동', title: '지구의 날', extraFields: [] }])).status).toBe(200);
    const c = (await (await h.call('POST', `/api/campaigns/${id}/clone`, { ...admin, body: {} })).json());
    expect(c.missions).toEqual([expect.objectContaining({ title: '지구의 날', date: null, round: null })]);
  });

  test('explainer post cannot be changed through generic post endpoints by non-admins', async () => {
    const { h, admin, create, publish } = await setup();
    const id = await create({ type: 'signature', title: '서명', summary: '서명해요.', schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-02-28' }, settings: { demandSummary: '요구안' } });
    const ex = (await (await h.call('PUT', `/api/campaigns/${id}/explainer`, { ...admin, body: { title: '설명', body: '본문' } })).json()).explainer;
    await publish(id);
    const u = await user(h, '서명자');
    await h.db.run("INSERT INTO participations (id, created_at, campaign_id, user_id, state) VALUES ('p1','t',?,?,'signed')", id, u);
    const asU = as(u, { 'X-Sim-Date': '2027-01-10' });
    expect((await h.call('PATCH', `/api/posts/${ex.id}`, { ...asU, body: { title: '바꿈' } })).status).toBe(403);
    expect((await h.call('DELETE', `/api/posts/${ex.id}`, asU)).status).toBe(403);
    expect((await h.call('POST', `/api/posts/${ex.id}/comments`, { ...asU, body: { body: '댓글' } })).status).toBe(403);
    expect((await h.call('POST', `/api/posts/${ex.id}/like`, asU)).status).toBe(403);
    expect((await h.call('POST', `/api/posts/${ex.id}/hide`, as(u, { 'X-Role': 'staff' }))).status).toBe(403);
    // participants cannot forge an explainer on the campaign board, nor convert a post into one
    expect((await h.call('POST', `/api/boards/campaign/${id}/posts`, { ...asU, body: { category: 'explainer', title: 't', body: 'b' } })).status).toBe(400);
    const own = (await (await h.call('POST', `/api/boards/campaign/${id}/posts`, { ...asU, body: { category: '자유', title: 't', body: 'b' } })).json()).id;
    expect((await h.call('PATCH', `/api/posts/${own}`, { ...asU, body: { category: 'explainer' } })).status).toBe(400);
    // admin may still patch it (category stays)
    expect((await h.call('PATCH', `/api/posts/${ex.id}`, { ...admin, body: { title: '관리자 수정' } })).status).toBe(200);
    expect((await h.call('PATCH', `/api/posts/${ex.id}`, { ...admin, body: { category: '자유' } })).status).toBe(400);
    expect((await h.db.first<{ title: string }>('SELECT title FROM posts WHERE id = ?', ex.id))!.title).toBe('관리자 수정');
  });

  test('clone clears schedule and participants', async () => {
    const { h, admin, practice, publish, missions } = await setup();
    const id = await practice();
    await missions(id, MISSIONS);
    await h.call('PUT', `/api/campaigns/${id}/checklist`, { ...admin, body: [{ label: '시작 전 공지 읽기', linkType: 'url', target: 'https://example.org/a' }] });
    const f = await (await h.call('POST', `/api/campaigns/${id}/files`, { ...admin, body: { name: '진행 가이드.pdf', mime: 'application/pdf', dataBase64: Buffer.from('pdf').toString('base64'), exclusive: true } })).json();
    await h.db.run("INSERT INTO tools (id, created_at, name) VALUES ('t1','t','1.5도 계산기')");
    expect((await h.call('PUT', `/api/campaigns/${id}/tools`, { ...admin, body: [{ toolId: 't1', exclusive: false }] })).status).toBe(200);
    await publish(id);
    const u = await user(h, '참가자');
    await h.db.run("INSERT INTO participations (id, created_at, campaign_id, user_id) VALUES ('p1','t',?,?)", id, u);
    await h.db.run("INSERT INTO posts (id, created_at, board_type, board_id, title, body, author_id) VALUES ('po1','t','campaign',?,'안녕','인사',?)", id, u);

    const r = await h.call('POST', `/api/campaigns/${id}/clone`, { ...admin, body: { title: '새해 1.5도 한달살기 (2028)' } });
    expect(r.status).toBe(201);
    const c = (await r.json()).campaign;
    expect(c.id).not.toBe(id);
    expect(c.title).toBe('새해 1.5도 한달살기 (2028)');
    expect(c.publish).toBe('draft');
    expect(c.hero).toBe(false);
    expect(c.schedule).toEqual({ recruitStart: null, recruitStartTime: null, recruitEnd: null, recruitEndTime: null, runStart: null, runDays: null, eventDate: null, eventStart: null, eventEnd: null, deliveryDate: null });
    expect(c.settings.missionCycle).toBe('weekly');
    const d = await (await h.call('GET', `/api/campaigns/${c.id}`, admin)).json();
    expect(d.status).toBe('draft');
    expect(d.counts.participants).toBe(0);
    expect(d.missions.map((m: { title: string }) => m.title)).toEqual(MISSIONS.map((m) => m.title));
    expect(d.checklist.filter((i: { kind: string }) => i.kind === 'custom').map((i: { label: string }) => i.label)).toEqual(['시작 전 공지 읽기']);
    expect(d.files).toEqual([expect.objectContaining({ id: f.id, name: '진행 가이드.pdf', exclusive: true })]);
    expect(d.tools).toEqual([expect.objectContaining({ toolId: 't1', exclusive: false })]);
    expect((await h.db.first<{ n: number }>("SELECT COUNT(*) n FROM posts WHERE board_type='campaign' AND board_id = ?", c.id))!.n).toBe(0);
    expect((await h.db.first<{ n: number }>('SELECT COUNT(*) n FROM participations WHERE campaign_id = ?', c.id))!.n).toBe(0);
  });

  test('bundle import recomputes rounds for new runDays', async () => {
    const { h, admin, practice, missions } = await setup();
    const src = await practice();
    await missions(src, MISSIONS);
    const b = await h.call('POST', '/api/mission-bundles', { ...admin, body: { campaignId: src, name: '1.5도 한달살기 기본 · 4주' } });
    expect(b.status).toBe(201);
    const bundleId = (await b.json()).id;
    const list = await (await h.call('GET', '/api/mission-bundles?q=' + encodeURIComponent('에너지'), admin)).json();
    expect(list.items).toEqual([expect.objectContaining({ id: bundleId, name: '1.5도 한달살기 기본 · 4주', cycle: 'weekly', recordCycle: 'daily', missionCount: 4 })]);

    const dst = await practice({ settings: { recordEnabled: true, missionCycle: 'daily', recordCycle: 'weekly' }, schedule: { ...SCHEDULE, runDays: 14 } });
    const r = await h.call('POST', `/api/campaigns/${dst}/missions/from-bundle/${bundleId}`, admin);
    expect(r.status).toBe(200);
    const d = await (await h.call('GET', `/api/campaigns/${dst}`, admin)).json();
    expect(d.missions.map((m: { round: number }) => m.round)).toEqual([1, 2]);
    expect(d.campaign.settings.missionCycle).toBe('weekly');
    expect(d.campaign.settings.recordCycle).toBe('daily');

    // dated bundle: dates shift by the runStart difference
    const dsrc = await practice({ settings: { recordEnabled: true, missionCycle: 'dated', recordCycle: 'once_end' } });
    expect((await missions(dsrc, [{ date: '2027-02-10', category: '행동', title: '지구의 날 하루 행동', extraFields: [] }])).status).toBe(200);
    const db = (await (await h.call('POST', '/api/mission-bundles', { ...admin, body: { campaignId: dsrc, name: '지구의 날' } })).json()).id;
    const ddst = await practice({ schedule: { ...SCHEDULE, runStart: '2027-03-01' } });
    await h.call('POST', `/api/campaigns/${ddst}/missions/from-bundle/${db}`, admin);
    const dd = await (await h.call('GET', `/api/campaigns/${ddst}`, admin)).json();
    expect(dd.missions.map((m: { date: string }) => m.date)).toEqual(['2027-03-03']);
  });

  test('status computed from viewer sim date', async () => {
    const { h, practice, publish, missions } = await setup();
    const id = await practice();
    await missions(id, MISSIONS);
    expect((await publish(id)).status).toBe(200);
    const u = await user(h, '보는 사람');
    const at = (d: string) => h.call('GET', `/api/campaigns/${id}`, as(u, { 'X-Sim-Date': d })).then((r) => r.json());
    expect((await at('2027-01-10')).status).toBe('recruiting');
    const running = await at('2027-02-20');
    expect(running.status).toBe('running');
    expect(running.phase).toBe('running');
    const list = await (await h.call('GET', '/api/campaigns?status=running', as(u, { 'X-Sim-Date': '2027-02-20' }))).json();
    expect(list.items.map((c: { id: string }) => c.id)).toEqual([id]);
    expect(list.items[0].status).toBe('running');
    expect(list.counts).toMatchObject({ all: 1, running: 1, recruiting: 0 });
  });

  test('settings validation rejects weekly mission with 0 missions when recordEnabled', async () => {
    const { h, admin, practice, publish, missions } = await setup();
    const id = await practice();
    const r = await publish(id);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatchObject({ code: 'INVALID_SETTINGS', field: 'missions' });
    const bad = await h.call('PUT', `/api/campaigns/${id}`, { ...admin, body: { settings: { recordCycle: 'hourly' } } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatchObject({ code: 'INVALID_SETTINGS', field: 'recordCycle' });
    // rounds beyond the run are rejected (28 days → 4 weeks)
    const over = await missions(id, [...MISSIONS, { round: 5, category: '소비', title: '다섯째 주', extraFields: [] }]);
    expect(over.status).toBe(400);
    expect((await over.json()).error.field).toBe('missions[4].round');
    await missions(id, MISSIONS);
    expect((await publish(id)).status).toBe(200);
    // recording off → no missions needed
    const off = await practice({ settings: { recordEnabled: false } });
    expect((await publish(off)).status).toBe(200);
  });

  test('drafts are admin-only; scheduled visible only with showUpcoming', async () => {
    const { h, admin, practice, publish, missions } = await setup();
    const u = await user(h, '회원');
    const viewer = as(u, { 'X-Sim-Date': '2026-12-01' });
    const id = await practice();
    await missions(id, MISSIONS);
    expect((await h.call('GET', `/api/campaigns/${id}`, viewer)).status).toBe(404);
    expect((await (await h.call('GET', '/api/campaigns', viewer)).json()).items).toHaveLength(0);
    expect((await (await h.call('GET', '/api/campaigns', { headers: { ...admin.headers, 'X-Sim-Date': '2026-12-01' } })).json()).items).toHaveLength(1);
    await publish(id, { mode: 'scheduled', showUpcoming: false });
    expect((await h.call('GET', `/api/campaigns/${id}`, viewer)).status).toBe(404);
    await publish(id, { mode: 'scheduled', showUpcoming: true });
    const d = await (await h.call('GET', `/api/campaigns/${id}`, viewer)).json();
    expect(d.status).toBe('scheduled');
    expect(d.phase).toBe('before');
  });

  test('checklist auto items follow settings', async () => {
    const { h, admin, practice, missions } = await setup();
    const id = await practice({ settings: { ...WEEKLY, startPoint: { enabled: true, toolId: 'calculator' } } });
    const keys = async () => (await (await h.call('GET', `/api/campaigns/${id}`, admin)).json()).checklist.map((i: { key: string }) => i.key);
    expect(await keys()).toEqual(['start_point', 'reminder', 'greet']);
    await missions(id, MISSIONS);
    const bad = await h.call('PUT', `/api/campaigns/${id}/checklist`, { ...admin, body: [{ label: '링크', linkType: 'url', target: 'javascript:alert(1)' }] });
    expect(bad.status).toBe(400);
    expect((await h.call('PUT', `/api/campaigns/${id}/checklist`, { ...admin, body: [{ label: '시작 전 공지 읽기', linkType: 'url', target: 'https://example.org' }] })).status).toBe(200);
    const items = (await (await h.call('GET', `/api/campaigns/${id}`, admin)).json()).checklist;
    expect(items.map((i: { key: string }) => i.key).slice(0, 4)).toEqual(['start_point', 'reminder', 'greet', 'first_mission']);
    expect(items[4]).toMatchObject({ kind: 'custom', label: '시작 전 공지 읽기', linkType: 'url', target: 'https://example.org', done: false });
  });

  test('offline exact address only for applicants', async () => {
    const { h, create, publish } = await setup();
    const id = await create({
      type: 'offline', title: '옥상 태양광 탐방 · 1월', summary: '옥상을 둘러봐요.',
      schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-01-23', eventDate: '2027-01-25', eventStart: '14:00', eventEnd: '16:00' },
      settings: { place: { exact: '마포구 성산동 123 옥상', public: '마포구 성산동' }, capacity: 20 },
    });
    expect((await publish(id)).status).toBe(200);
    const u = await user(h, '신청자');
    const get = () => h.call('GET', `/api/campaigns/${id}`, as(u, { 'X-Sim-Date': '2027-01-10' })).then((r) => r.json());
    const d = await get();
    expect(d.campaign.settings.place).toEqual({ exact: '', public: '마포구 성산동' });
    expect(d.counts).toMatchObject({ participants: 0, seatsLeft: 20 });
    await h.db.run("INSERT INTO participations (id, created_at, campaign_id, user_id, companions) VALUES ('p1','t',?,?,1)", id, u);
    const d2 = await get();
    expect(d2.campaign.settings.place.exact).toBe('마포구 성산동 123 옥상');
    expect(d2.myParticipation).toMatchObject({ state: 'applied', companions: 1 });
    expect(d2.counts).toMatchObject({ participants: 1, seatsLeft: 18 });
  });

  test('signature explainer post is saved and returned publicly', async () => {
    const { h, admin, create, publish } = await setup();
    const id = await create({ type: 'signature', title: '우리 동네 기후예산 요구 서명', summary: '서명해요.', schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-02-28' }, settings: { demandSummary: '기후 예산을 늘려 주세요.' } });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
    const r = await h.call('PUT', `/api/campaigns/${id}/explainer`, { ...admin, body: { title: '왜 이 요구안을 냈나요', body: '본문', attachments: [{ name: 'a.png', mime: 'image/png', dataBase64: png }] } });
    expect(r.status).toBe(200);
    const first = (await r.json()).explainer;
    // update keeps the existing attachment by id
    const r2 = await h.call('PUT', `/api/campaigns/${id}/explainer`, { ...admin, body: { title: '왜 이 요구안을 냈나요', body: '고친 본문', attachments: [{ id: first.attachments[0].id }] } });
    expect((await r2.json()).explainer.id).toBe(first.id);
    expect((await publish(id)).status).toBe(200);
    const u = await user(h, '서명자');
    const d = await (await h.call('GET', `/api/campaigns/${id}`, as(u, { 'X-Sim-Date': '2027-01-10' }))).json();
    expect(d.explainer).toMatchObject({ id: first.id, title: '왜 이 요구안을 냈나요', body: '고친 본문' });
    expect(d.explainer.attachments).toHaveLength(1);
    expect(d.campaign.settings.explainerPostId).toBe(first.id);
    expect(d.checklist.map((i: { key: string }) => i.key)).toEqual(['share', 'delivery_alert']);
    // public viewers can load explainer images; the explainer is not a board post
    expect((await h.call('GET', `/api/files/${first.attachments[0].id}`, as(u, { 'X-Sim-Date': '2027-01-10' }))).status).toBe(200);
    await h.db.run("INSERT INTO participations (id, created_at, campaign_id, user_id, state) VALUES ('p1','t',?,?,'signed')", id, u);
    const board = await (await h.call('GET', `/api/boards/campaign/${id}/posts`, as(u))).json();
    expect(board.items).toHaveLength(0);
  });

  test('exclusive files: listed and served to participants only, even when also linked non-exclusively', async () => {
    const { h, admin, practice, publish, missions } = await setup();
    const a = await practice();
    await missions(a, MISSIONS);
    await publish(a);
    const big = Buffer.alloc(1_100_000, 1).toString('base64');
    expect((await h.call('POST', `/api/campaigns/${a}/files`, { ...admin, body: { name: 'big', mime: 'application/pdf', dataBase64: big, exclusive: false } })).status).toBe(413);
    const f = await (await h.call('POST', `/api/campaigns/${a}/files`, { ...admin, body: { name: '가이드', mime: 'application/pdf', dataBase64: 'aGk=', exclusive: true } })).json();
    // clone + make the clone's link open: mixed links must still gate
    const b = (await (await h.call('POST', `/api/campaigns/${a}/clone`, { ...admin, body: {} })).json()).campaign.id;
    await h.db.run('UPDATE campaign_files SET exclusive = 0 WHERE campaign_id = ?', b);
    const u = await user(h, '외부');
    const viewer = as(u, { 'X-Sim-Date': '2027-01-10' });
    expect((await (await h.call('GET', `/api/campaigns/${a}`, viewer)).json()).files).toEqual([]);
    expect((await h.call('GET', `/api/files/${f.id}`, viewer)).status).toBe(403);
    await h.db.run("INSERT INTO participations (id, created_at, campaign_id, user_id) VALUES ('p1','t',?,?)", a, u);
    expect((await (await h.call('GET', `/api/campaigns/${a}`, viewer)).json()).files).toHaveLength(1);
    expect((await h.call('GET', `/api/files/${f.id}`, viewer)).status).toBe(200);
    expect((await h.call('GET', `/api/files/${f.id}`, admin)).status).toBe(200);
  });
  test('PUT image sets the cover image; replacing keeps blobs other campaigns still use', async () => {
    const { h, admin, practice } = await setup();
    const id = await practice();
    const png = Buffer.from('img').toString('base64');
    expect((await h.call('PUT', `/api/campaigns/${id}/image`, { ...admin, body: { mime: 'image/svg+xml', dataBase64: png } })).status).toBe(400);
    const r = await h.call('PUT', `/api/campaigns/${id}/image`, { ...admin, body: { mime: 'image/jpeg', dataBase64: png } });
    expect(r.status).toBe(200);
    const first = (await r.json()).campaign.imageFileId as string;
    expect(first).toBeTruthy();
    expect((await h.call('GET', `/api/files/${first}`, admin)).status).toBe(200);
    const clone = (await (await h.call('POST', `/api/campaigns/${id}/clone`, { ...admin, body: {} })).json()).campaign;
    expect(clone.imageFileId).toBe(first);
    const second = (await (await h.call('PUT', `/api/campaigns/${id}/image`, { ...admin, body: { mime: 'image/jpeg', dataBase64: png } })).json()).campaign.imageFileId;
    expect(second).not.toBe(first);
    expect((await h.call('GET', `/api/files/${first}`, admin)).status).toBe(200); // clone still uses it
    await h.call('PUT', `/api/campaigns/${clone.id}/image`, { ...admin, body: { mime: 'image/jpeg', dataBase64: png } });
    expect((await h.call('GET', `/api/files/${first}`, admin)).status).toBe(404);
    const u = await user(h, '회원');
    expect((await h.call('PUT', `/api/campaigns/${id}/image`, { ...as(u), body: { mime: 'image/jpeg', dataBase64: png } })).status).toBe(403);
  });
  test('null clears optional settings keys', async () => {
    const { h, admin, create } = await setup();
    const id = await create({ type: 'offline', title: '옥상 탐방', settings: { customQuestion: '계단을 오를 수 있나요?' } });
    const before = (await (await h.call('GET', `/api/campaigns/${id}`, admin)).json()).campaign.settings;
    expect(before.customQuestion).toBe('계단을 오를 수 있나요?');
    const r = await h.call('PUT', `/api/campaigns/${id}`, { ...admin, body: { settings: { customQuestion: null } } });
    expect(r.status).toBe(200);
    expect((await r.json()).campaign.settings.customQuestion).toBeUndefined();
  });
});
