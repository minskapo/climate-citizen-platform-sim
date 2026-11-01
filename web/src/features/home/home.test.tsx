import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import { __reloadSimForTest, simStore } from '../../lib/sim';
import { DISMISS_KEY } from './StickyCalcBar';

let hero: unknown = null;
let agg: Record<string, unknown> = { count: 15234, avg: null, policyCounts: {} };
let myParts: unknown[] = [];
let measurements: unknown[] = [];

const campaignDetail = (over: Record<string, unknown> = {}) => ({
  campaign: {
    id: 'c1', type: 'practice', title: '새해 1.5도 한달살기', summary: '함께 실천해요.', imageFileId: null, host: { type: 'igt', name: '녹색전환연구소' },
    schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-01-31', runStart: '2027-02-08', runDays: 28 },
    settings: { mode: 'hybrid', missionCycle: 'weekly', recordCycle: 'daily', recordEnabled: true, recordFields: ['check'] }, ...over,
  },
  status: 'recruiting', counts: { participants: 312 }, missions: [{ round: 1, category: '식생활', title: '하루 한 끼 채식', extraFields: [] }], ...{},
});

vi.mock('../../lib/api', () => ({
  ApiError: class extends Error {},
  api: vi.fn(async (path: string) => {
    if (path === '/api/campaigns/hero') return { campaign: hero };
    if (path === '/api/aggregates/calculator') return agg;
    if (path === '/api/me/participations') return { items: myParts };
    if (path === '/api/me/measurements') return { items: measurements };
    if (path.startsWith('/api/participations/') && path.endsWith('/records')) return { records: [], slots: [], pausedDates: [], backfillable: [], nextSlot: null, isSlotToday: true, progress: { done: 12, total: 28, dueSoFar: 12, streak: 5 }, missedStreak: 0 };
    if (path.startsWith('/api/campaigns')) return { items: [], nextCursor: null };
    if (path.startsWith('/api/popular')) return { items: [] };
    if (path.startsWith('/api/groups')) return { items: [], nextCursor: null };
    return {};
  }),
}));

const open = () => render(<MemoryRouter><HomePage /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  __reloadSimForTest();
  hero = null; agg = { count: 15234, avg: null, policyCounts: {} }; myParts = []; measurements = [];
  simStore.set({ fixedDate: '2027-02-10', dateOffsetDays: 0, pendingMeasurementIds: [] });
});

const scrollTo = (y: number) => act(() => { Object.defineProperty(window, 'scrollY', { value: y, configurable: true }); window.dispatchEvent(new Event('scroll')); });

describe('home', () => {
  test('guest hero shows hero campaign or intro when none', async () => {
    hero = campaignDetail();
    const { unmount } = open();
    expect(await screen.findByRole('heading', { level: 1, name: '새해 1.5도 한달살기' })).toBeInTheDocument();
    expect(screen.getByText('계산기로 출발점 재기')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '참여 신청하기' })).toHaveAttribute('href', '/campaigns/c1');
    unmount();
    hero = null;
    open();
    expect(await screen.findByText(/정책까지 바꾸는 기후시민/)).toBeInTheDocument();
  });

  test('calculator average hidden under 3 measurements', async () => {
    open();
    expect(await screen.findByText('아직 집계 중')).toBeInTheDocument();
    expect(screen.getByText('15,234')).toBeInTheDocument();
  });

  test('calculator average shown from 3 measurements', async () => {
    agg = { count: 5, avg: 11.4, policyCounts: {} };
    open();
    expect(await screen.findByText('11.4톤')).toBeInTheDocument();
  });

  test('logged-in hero shows weekly mission label for weekly cycle', async () => {
    simStore.set({ role: 'member', userId: 'u1', nickname: '햇빛부자' });
    const d = campaignDetail();
    myParts = [{ ...d, status: 'running', myParticipation: { id: 'p1', state: 'applied', paused: false } }];
    open();
    expect(await screen.findByRole('heading', { level: 1, name: /이번 주 미션/ })).toHaveTextContent('하루 한 끼 채식');
    expect(await screen.findByRole('radio', { name: '했어요' })).toBeInTheDocument();
  });

  test('sticky calc bar hidden after measuring', async () => {
    open();
    await screen.findByText('아직 집계 중');
    scrollTo(900);
    expect(await screen.findByText('1.5도 계산기 시작하기')).toBeInTheDocument();
    // 닫으면 기억한다
    act(() => screen.getByText('닫기').click());
    expect(screen.queryByText('1.5도 계산기 시작하기')).toBeNull();
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1');
  });

  test('sticky calc bar not shown when a pending measurement exists or member measured', async () => {
    simStore.set({ pendingMeasurementIds: ['x1'] });
    const { unmount } = open();
    await screen.findByText('아직 집계 중');
    scrollTo(900);
    expect(screen.queryByText('1.5도 계산기 시작하기')).toBeNull();
    unmount();
    simStore.set({ pendingMeasurementIds: [], role: 'member', userId: 'u1', nickname: '햇빛부자' });
    measurements = [{ id: 'm1', simDate: '2027-01-10', result: { total: 11.2 }, actions: [], policies: [] }];
    open();
    await waitFor(() => expect(screen.getAllByText(/11\.2/).length).toBeGreaterThan(0));
    expect(screen.queryByText('1.5도 계산기 시작하기')).toBeNull();
  });
});

describe('home load errors', () => {
  test('records failure shows retry instead of a spinner', async () => {
    const { api } = await import('../../lib/api');
    simStore.set({ role: 'member', userId: 'u1', nickname: '햇빛부자' });
    const d = campaignDetail();
    myParts = [{ ...d, status: 'running', myParticipation: { id: 'p1', state: 'applied', paused: false } }];
    const impl = vi.mocked(api).getMockImplementation()!;
    vi.mocked(api).mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (path.endsWith('/records')) throw new Error('x');
      return (impl as (p: string, ...r: unknown[]) => Promise<never>)(path, ...rest);
    });
    open();
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    vi.mocked(api).mockImplementation(impl);
  });
});
