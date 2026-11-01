import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyCarbonRecords } from './MyCarbonRecords';
import { AccountSettings } from './AccountSettings';
import { NotificationsPanel } from '../../components/NotificationsPanel';
import { __reloadSimForTest, simStore } from '../../lib/sim';
import { ACTIONS } from '@shared/calculator';

const calls: Array<{ path: string; method?: string; body?: Record<string, unknown> }> = [];
let patchFail = false;
class MockApiError extends Error { constructor(public status: number, public code: string, m: string) { super(m); } }
const me = { id: 'u1', nickname: '햇빛부자', sido: '강원', sigungu: '원주', consents: { terms: true, research: true }, settings: {} };

vi.mock('../../lib/api', () => ({
  ApiError: class extends Error { constructor(public status: number, public code: string, m: string) { super(m); } },
  api: vi.fn(async (path: string, init?: { method?: string; body?: Record<string, unknown> }) => {
    calls.push({ path, method: init?.method, body: init?.body });
    if (path === '/api/me/measurements') return { items: [{ id: 'm1', simDate: '2027-01-10', place: 'home', kind: 'plain', result: { total: 11.2 }, actions: [ACTIONS[0].id], policies: ['대중교통 노선 확대'] }] };
    if (path === '/api/aggregates/calculator') return { count: 10, avg: 11.4, policyCounts: {} };
    if (path === '/api/me' && init?.method === 'PATCH') {
      if (patchFail) { const { ApiError } = await import('../../lib/api'); throw new (ApiError as unknown as typeof MockApiError)(409, 'NICKNAME_TAKEN', 'x'); }
      return { ...me, ...init.body };
    }
    if (path === '/api/me') return me;
    if (path === '/api/notifications') return { items: [{ id: 'n1', kind: 'notice', text: '공지가 올라왔어요', link: '/campaigns/c1', read: false, createdAt: '2027-02-10T00:00:00Z', simDate: '2027-02-10' }], unread: 1 };
    if (path === '/api/notifications/sync') return { unread: 0 };
    return {};
  }),
}));

beforeEach(() => {
  calls.length = 0; patchFail = false;
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ role: 'member', userId: 'u1', nickname: '햇빛부자', token: 't' });
});

describe('me', () => {
  test('my carbon records list chosen actions and policies', async () => {
    render(<MemoryRouter><MyCarbonRecords /></MemoryRouter>);
    expect(await screen.findByText('11.2톤', { selector: '.mcr-total' })).toBeInTheDocument();
    expect(screen.getByText(ACTIONS[0].name)).toBeInTheDocument();
    expect(screen.getByText('대중교통 노선 확대')).toBeInTheDocument();
  });

  test('nickname conflict shows message; consents are merged when saving', async () => {
    render(<MemoryRouter><AccountSettings /></MemoryRouter>);
    const input = await screen.findByDisplayValue('햇빛부자');
    patchFail = true;
    fireEvent.change(input, { target: { value: '다른이름' } });
    fireEvent.click(screen.getByRole('button', { name: '저장하기' }));
    expect(await screen.findByText('이미 쓰고 있는 활동명이에요')).toBeInTheDocument();
    patchFail = false;
    fireEvent.click(screen.getByRole('switch', { name: '모임 새 글 알림' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && (c.body?.settings as Record<string, unknown>)?.newPostAlert === true)).toBe(true));
    fireEvent.click(screen.getByRole('switch', { name: '연구 활용 동의' }));
    await waitFor(() => {
      const c = calls.filter((x) => x.method === 'PATCH').pop()!;
      expect(c.body?.consents).toEqual({ terms: true, research: false });
    });
  });

  test('notifications are marked read on view', async () => {
    render(<MemoryRouter><NotificationsPanel /></MemoryRouter>);
    expect(await screen.findByText('공지가 올라왔어요')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path === '/api/notifications/read' && c.method === 'POST')).toBe(true));
  });
});
