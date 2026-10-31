import { describe, expect, test } from 'vitest';
import { on, setup, user } from './helpers/campaign';

async function joined(over: Record<string, unknown> = {}) {
  const s = await setup();
  const id = await s.practice(over);
  const u = await user(s.h, '참가자');
  const p = (await (await s.h.call('POST', `/api/campaigns/${id}/participate`, { ...on(u, '2027-01-10'), body: { answers: {}, consents: {} } })).json()).participation.id as string;
  const put = (slot: string, date: string, body: Record<string, unknown> = { check: 'done' }) =>
    s.h.call('PUT', `/api/participations/${p}/records/${slot}`, { ...on(u, date), body });
  return { ...s, id, u, p, put };
}

describe('records', () => {
  test('records outside run window are rejected', async () => {
    const { put } = await joined();
    const r = await put('2027-03-08', '2027-03-08');
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('NOT_A_SLOT');
    expect((await put('2027-02-07', '2027-02-07')).status).toBe(400);
  });

  test('today record saved with mission and sim date; re-saving updates', async () => {
    const { h, put, p } = await joined({ recordFields: ['check', 'memo'] });
    const r = await put('2027-02-15', '2027-02-15', { check: 'partial', memo: '조금 했어요' });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.record).toMatchObject({ slotDate: '2027-02-15', check: 'partial', memo: '조금 했어요' });
    expect((await put('2027-02-15', '2027-02-15', { check: 'done' })).status).toBe(200);
    const rows = await h.db.all<{ sim_date: string; mission_id: string }>('SELECT sim_date, mission_id FROM records WHERE participation_id = ?', p);
    expect(rows).toHaveLength(1);
    expect(rows[0].sim_date).toBe('2027-02-15');
    const m = await h.db.first<{ round: number }>('SELECT round FROM missions WHERE id = ?', rows[0].mission_id);
    expect(m?.round).toBe(2);
    expect((await put('2027-02-15', '2027-02-15', { check: 'maybe' })).status).toBe(400);
  });

  test('future slot → 400 TOO_EARLY', async () => {
    const { put } = await joined();
    const r = await put('2027-02-20', '2027-02-15');
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('TOO_EARLY');
  });

  test('backfill limited to last 2 slots', async () => {
    const { put } = await joined();
    // my date 2027-02-15 → slots 02-13, 02-14 are backfillable, 02-12 is too late
    expect((await put('2027-02-14', '2027-02-15')).status).toBe(200);
    expect((await put('2027-02-13', '2027-02-15')).status).toBe(200);
    const late = await put('2027-02-12', '2027-02-15');
    expect(late.status).toBe(400);
    expect((await late.json()).error.code).toBe('TOO_LATE');
    // already recorded past slot cannot be edited
    expect((await put('2027-02-14', '2027-02-15', { check: 'none' })).status).toBe(400);
  });

  test('weekly record cycle: only the slot day is a turn', async () => {
    const { put } = await joined({ recordCycle: 'weekly' });
    expect((await (await put('2027-02-10', '2027-02-10')).json()).error.code).toBe('NOT_A_SLOT');
    expect((await put('2027-02-14', '2027-02-14')).status).toBe(200);
  });

  test('photo over 1MB rejected; disabled field rejected', async () => {
    const { put } = await joined({ recordFields: ['check', 'photo'] });
    const big = Buffer.alloc(1_000_001).toString('base64');
    expect((await put('2027-02-10', '2027-02-10', { check: 'done', photo: big })).status).toBe(413);
    expect((await put('2027-02-10', '2027-02-10', { check: 'done', number: 3 })).status).toBe(400);
    const ok = await put('2027-02-10', '2027-02-10', { check: 'done', photo: Buffer.from('jpeg').toString('base64') });
    expect(ok.status).toBe(200);
    expect((await ok.json()).record.photoFileId).toBeTruthy();
  });

  test('alsoPost creates 인증 post on the campaign board once', async () => {
    const { h, put, id, u } = await joined({ recordFields: ['check', 'memo'] });
    expect((await put('2027-02-10', '2027-02-10', { check: 'done', memo: '걸었어요', alsoPost: true })).status).toBe(200);
    expect((await put('2027-02-10', '2027-02-10', { check: 'done', memo: '걸었어요!', alsoPost: true })).status).toBe(200);
    const posts = await h.db.all<{ category: string; author_id: string }>("SELECT category, author_id FROM posts WHERE board_type = 'campaign' AND board_id = ?", id);
    expect(posts).toEqual([{ category: '인증', author_id: u }]);
  });

  test('today-count counts records for the date', async () => {
    const { h, put, id } = await joined();
    await put('2027-02-10', '2027-02-10');
    const v = await user(h, '두번째');
    const pv = (await (await h.call('POST', `/api/campaigns/${id}/participate`, { ...on(v, '2027-01-11'), body: { answers: {}, consents: {} } })).json()).participation.id;
    await h.call('PUT', `/api/participations/${pv}/records/2027-02-10`, { ...on(v, '2027-02-10'), body: { check: 'none' } });
    const r = await (await h.call('GET', `/api/campaigns/${id}/today-count?date=2027-02-10`, on(v, '2027-02-11'))).json();
    expect(r).toEqual({ date: '2027-02-10', count: 2 });
    const r2 = await (await h.call('GET', `/api/campaigns/${id}/today-count`, on(v, '2027-02-11'))).json();
    expect(r2.count).toBe(0);
  });

  test('records view shows progress and paused dates', async () => {
    const { h, put, p, u } = await joined();
    await put('2027-02-08', '2027-02-08');
    await h.call('POST', `/api/participations/${p}/pause`, on(u, '2027-02-09'));
    const v = await (await h.call('GET', `/api/participations/${p}/records`, on(u, '2027-02-20'))).json();
    expect(v.records).toHaveLength(1);
    expect(v.progress).toMatchObject({ done: 1, total: 28 });
    // 02-09..02-15 paused; 02-16..02-19 missed
    expect(v.missedStreak).toBe(4);
    expect(v.backfillable).toEqual(['2027-02-18', '2027-02-19']);
  });
});
