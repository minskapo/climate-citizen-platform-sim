import { describe, expect, test } from 'vitest';
import { calculate, POLICIES_REDUCE, POLICIES_SOCIAL, SOCIAL_FOUNDATION } from '@shared/calculator';
import { as, on, setup, user } from './helpers/campaign';

const OVER = { car: 50 }; // 8.0 t
const UNDER = { bus: 2 }; // 0.1 t

describe('measurements', () => {
  test('server recomputes measurement result', async () => {
    const { h } = await setup();
    const u = await user(h, '측정');
    const r = await h.call('POST', '/api/measurements', { ...on(u, '2027-01-10'), body: { answers: OVER, place: 'home', result: { total: 0.1 }, total: 0.1 } });
    expect(r.status).toBe(201);
    const m = (await r.json()).measurement;
    expect(m.result.total).toBeCloseTo(calculate(OVER).total);
    expect(m.simDate).toBe('2027-01-10');
    expect(m.place).toBe('home');
    expect(m.kind).toBe('plain');
    expect((await h.call('POST', '/api/measurements', { ...as(u), body: { answers: { diet: 9 }, place: 'home' } })).status).toBe(400);
    expect((await h.call('POST', '/api/measurements', { ...as(u), body: { answers: OVER, place: 'moon' } })).status).toBe(400);
  });

  test('choices: actions only when over 5.9, max 3; policies from the matching list', async () => {
    const { h } = await setup();
    const u = await user(h, '측정');
    const over = (await (await h.call('POST', '/api/measurements', { ...as(u), body: { answers: OVER, place: 'menu' } })).json()).measurement.id;
    const under = (await (await h.call('POST', '/api/measurements', { ...as(u), body: { answers: UNDER, place: 'menu' } })).json()).measurement.id;
    const ch = (id: string, body: unknown) => h.call('POST', `/api/measurements/${id}/choices`, { ...as(u), body });
    expect((await ch(over, { actions: ['eatout_half', 'meat_less', 'coffee_half', 'clothes_less'] })).status).toBe(400);
    expect((await ch(over, { actions: ['nope'] })).status).toBe(400);
    expect((await ch(over, { policies: [POLICIES_SOCIAL[0]] })).status).toBe(400);
    expect((await ch(over, { social: [SOCIAL_FOUNDATION[0].items[0]] })).status).toBe(400);
    const ok = await ch(over, { actions: ['eatout_half', 'meat_less'], policies: [POLICIES_REDUCE[0], POLICIES_REDUCE[1]] });
    expect(ok.status).toBe(200);
    expect((await ok.json()).measurement.actions).toEqual(['eatout_half', 'meat_less']);
    expect((await ch(under, { actions: ['eatout_half'] })).status).toBe(400);
    expect((await ch(under, { social: [SOCIAL_FOUNDATION[0].items[0]], policies: [POLICIES_SOCIAL[0]] })).status).toBe(200);
    const other = await user(h, '남');
    expect((await h.call('POST', `/api/measurements/${over}/choices`, { ...as(other), body: { policies: [] } })).status).toBe(404);
  });

  test('guest measurement with localId, claimed after signup', async () => {
    const { h } = await setup();
    const r = await h.call('POST', '/api/measurements', { headers: { 'X-Sim-Date': '2027-01-10' }, body: { answers: OVER, place: 'home', localId: 'loc-1' } });
    expect(r.status).toBe(201);
    const id = (await r.json()).measurement.id;
    expect((await h.call('POST', '/api/measurements', { body: { answers: OVER, place: 'home' } })).status).toBe(400);
    expect((await h.call('POST', `/api/measurements/${id}/choices`, { body: { localId: 'loc-1', policies: [POLICIES_REDUCE[2]] } })).status).toBe(200);
    const u = await user(h, '새회원');
    const c = await (await h.call('POST', '/api/measurements/claim', { ...as(u), body: { localIds: ['loc-1', 'other'] } })).json();
    expect(c.claimed).toBe(1);
    const mine = await (await h.call('GET', '/api/me/measurements', as(u))).json();
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({ id, policies: [POLICIES_REDUCE[2]], simDate: '2027-01-10' });
    // second claim by another user does nothing
    const v = await user(h, '다른회원');
    expect((await (await h.call('POST', '/api/measurements/claim', { ...as(v), body: { localIds: ['loc-1'] } })).json()).claimed).toBe(0);
  });

  test('end measurement only counts inside the run window', async () => {
    const { h, practice } = await setup();
    const id = await practice();
    const u = await user(h, '참가자');
    const post = (date: string) => h.call('POST', '/api/measurements', { ...on(u, date), body: { answers: UNDER, place: 'campaign', campaignId: id, kind: 'end' } });
    expect((await (await post('2027-03-20')).json()).measurement.kind).toBe('plain');
    expect((await (await post('2027-03-07')).json()).measurement.kind).toBe('end');
    expect((await h.call('POST', '/api/measurements', { ...as(u), body: { answers: UNDER, place: 'campaign', campaignId: 'nope' } })).status).toBe(404);
  });

  test('calculator aggregate: avg null under 3 people, policy counts from latest measurement per user', async () => {
    const { h } = await setup();
    const save = async (u: string, answers: Record<string, number>, policies: string[]) => {
      const id = (await (await h.call('POST', '/api/measurements', { ...as(u), body: { answers, place: 'home' } })).json()).measurement.id;
      await h.call('POST', `/api/measurements/${id}/choices`, { ...as(u), body: { policies } });
    };
    const [a, b, c] = [await user(h, '가'), await user(h, '나'), await user(h, '다')];
    await save(a, OVER, [POLICIES_REDUCE[0]]);
    await save(b, OVER, [POLICIES_REDUCE[0], POLICIES_REDUCE[1]]);
    let agg = await (await h.call('GET', '/api/aggregates/calculator', as(a))).json();
    expect(agg.count).toBe(2);
    expect(agg.avg).toBeNull();
    await save(c, UNDER, [POLICIES_SOCIAL[0]]);
    await save(a, OVER, [POLICIES_REDUCE[1]]); // replaces a's earlier choice
    agg = await (await h.call('GET', '/api/aggregates/calculator', as(a))).json();
    expect(agg.count).toBe(3);
    expect(agg.avg).toBeCloseTo((calculate(OVER).total * 2 + calculate(UNDER).total) / 3);
    expect(agg.policyCounts).toEqual({ [POLICIES_REDUCE[0]]: 1, [POLICIES_REDUCE[1]]: 2, [POLICIES_SOCIAL[0]]: 1 });
  });
});
