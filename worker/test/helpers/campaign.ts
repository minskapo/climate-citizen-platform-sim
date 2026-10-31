import { expect } from 'vitest';
import { harness, type Harness } from './client';

export async function user(h: Harness, nickname: string, sido = '') {
  const r = await h.call('POST', '/api/users', { body: { nickname, sido, consents: { terms: true } } });
  return (await r.json()).id as string;
}
export const as = (id: string, extra: Record<string, string> = {}) => ({ headers: { 'X-User-Id': id, ...extra } });

export const PRACTICE_SCHEDULE = { recruitStart: '2027-01-04', recruitStartTime: '10:00', recruitEnd: '2027-01-31', recruitEndTime: '23:59', runStart: '2027-02-08', runDays: 28 };
export const OFFLINE_SCHEDULE = { recruitStart: '2027-01-04', recruitEnd: '2027-01-20', eventDate: '2027-01-24', eventStart: '14:00', eventEnd: '16:00' };
export const SIGNATURE_SCHEDULE = { recruitStart: '2027-01-04', recruitEnd: '2027-02-28' };
export const MISSIONS = [1, 2, 3, 4].map((round) => ({ round, category: `분류${round}`, title: `${round}주차 미션`, extraFields: [] }));

export async function setup() {
  const h = harness();
  const adminId = await user(h, '관리자');
  const admin = as(adminId, { 'X-Role': 'admin' });
  const create = async (body: Record<string, unknown>) => {
    const r = await h.call('POST', '/api/campaigns', { ...admin, body });
    expect(r.status).toBe(201);
    const id = (await r.json()).campaign.id as string;
    return id;
  };
  const publish = async (id: string) => {
    const r = await h.call('POST', `/api/campaigns/${id}/publish`, { ...admin, body: { mode: 'now' } });
    expect(r.status).toBe(200);
  };
  const practice = async (settings: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const id = await create({
      type: 'practice', title: '한달살기', summary: '함께 실천해요.', schedule: PRACTICE_SCHEDULE,
      settings: { recordEnabled: true, missionCycle: 'weekly', recordCycle: 'daily', ...settings }, ...extra,
    });
    expect((await h.call('PUT', `/api/campaigns/${id}/missions`, { ...admin, body: MISSIONS })).status).toBe(200);
    await publish(id);
    return id;
  };
  const offline = async (settings: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const id = await create({
      type: 'offline', title: '탐방', summary: '둘러봐요.', schedule: OFFLINE_SCHEDULE,
      settings: { place: { exact: '서울시 어딘가 1', public: '서울 마포' }, capacity: 1, waitlist: true, ...settings }, ...extra,
    });
    await publish(id);
    return id;
  };
  const signature = async (settings: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const id = await create({ type: 'signature', title: '서명', summary: '서명해요.', schedule: SIGNATURE_SCHEDULE, settings: { demandSummary: '요구안', ...settings }, ...extra });
    await publish(id);
    return id;
  };
  const group = async (ownerId: string, join_policy = 'open') => {
    const r = await h.call('POST', '/api/groups', { ...as(ownerId), body: { name: '모임' + Math.random().toString(36).slice(2, 6), joinPolicy: join_policy } });
    expect(r.status).toBe(201);
    return (await r.json()).id as string;
  };
  return { h, adminId, admin, create, publish, practice, offline, signature, group };
}

export const on = (uid: string, date: string, time = '12:00', extra: Record<string, string> = {}) =>
  as(uid, { 'X-Sim-Date': date, 'X-Sim-Time': time, ...extra });
