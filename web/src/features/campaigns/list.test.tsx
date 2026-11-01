import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CampaignListPage } from './CampaignListPage';
import { __reloadSimForTest, simStore } from '../../lib/sim';

const calls: string[] = [];
const item = (id: string, type: string, title: string, schedule: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id, type, title, summary: `${title} 설명`, imageFileId: null, host: { type: 'igt', name: '녹색전환연구소' }, mode: 'online', schedule,
  status: 'recruiting', participantCount: 5, subscriberCount: 7, hero: false, ...extra,
});
vi.mock('../../lib/api', () => ({
  ApiError: class extends Error {},
  API_BASE: '',
  simHeaders: () => ({}),
  api: vi.fn(async (path: string) => {
    calls.push(path);
    if (path.startsWith('/api/campaigns/hero')) return { campaign: null };
    return {
      items: [
        item('a', 'practice', '한달살기', { recruitStart: '2027-01-04', recruitEnd: '2027-01-31', runStart: '2027-02-08', runDays: 28 }),
        item('b', 'signature', '기후예산 서명', { recruitStart: '2027-02-01', recruitEnd: '2027-02-28' }),
      ],
      nextCursor: null,
      counts: { all: 2, recruiting: 1, running: 0, scheduled: 1, closed: 0, draft: 0 },
    };
  }),
}));

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ fixedDate: '2027-01-10' });
});

describe('campaign list', () => {
  test('list filters by type and status chips', async () => {
    render(<MemoryRouter><CampaignListPage /></MemoryRouter>);
    expect(await screen.findByText('한달살기')).toBeInTheDocument();
    // status per viewer date: signature not yet open → 모집 예정 with 알림 신청 count
    expect(screen.getByText('7명 알림 신청')).toBeInTheDocument();
    expect(screen.getByText('5명 참여')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '실천' }));
    await waitFor(() => expect(calls.some((c) => c.startsWith('/api/campaigns?') && c.includes('type=practice'))).toBe(true));
    fireEvent.click(screen.getByRole('tab', { name: /모집 중/ }));
    await waitFor(() => expect(calls.some((c) => c.includes('status=recruiting') && c.includes('type=practice'))).toBe(true));
    expect(screen.getByRole('button', { name: '캠페인 협업 제안' })).toBeInTheDocument();
  });
});
