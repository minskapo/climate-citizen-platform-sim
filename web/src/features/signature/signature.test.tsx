import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CampaignDetailPage } from '../campaigns/CampaignDetailPage';
import { ToastHost } from '../../components/Toast';
import { buildShareUrl } from '../../lib/share';
import { __reloadSimForTest, simStore } from '../../lib/sim';

let detail: Record<string, unknown> = {};
let agg: Record<string, unknown> = {};
let delivery: Record<string, unknown> = { delivery: null };
const calls: Array<{ path: string; opts?: { method?: string; body?: Record<string, unknown> } }> = [];
vi.mock('../../lib/api', () => ({
  ApiError: class extends Error { status = 0; },
  API_BASE: '',
  simHeaders: () => ({}),
  downloadBlob: vi.fn(),
  api: vi.fn(async (path: string, opts?: { method?: string; body?: Record<string, unknown> }) => {
    calls.push({ path, opts });
    if (path === '/api/campaigns/c1') return detail;
    if (path === '/api/aggregates/signature/c1') return agg;
    if (path === '/api/campaigns/c1/delivery') return delivery;
    if (path === '/api/campaigns/c1/participate') return { participation: { id: 'p9', signatureNo: 5 }, waitlisted: false };
    if (path === '/api/me') return { nickname: '햇빛부자', sido: '강원', sigungu: '원주시' };
    if (path.startsWith('/api/me/measurements')) return { items: [] };
    if (path.startsWith('/api/posts/')) return { items: [] };
    if (path.startsWith('/api/groups')) return { id: 'g1', name: '기후정책 아카데미 동문 모임', sido: '', joinPolicy: 'approval', memberCount: 58, myRole: null };
    return {};
  }),
}));

function makeDetail(over: { settings?: Record<string, unknown>; mine?: Record<string, unknown> | null; subscribed?: boolean } = {}) {
  return {
    campaign: {
      id: 'c1', type: 'signature', title: '우리 동네 기후예산 요구 서명', summary: '서명해요.', imageFileId: null,
      host: { type: 'group', id: 'g1', name: '기후정책 아카데미 동문 모임' }, hostGroupId: 'g1',
      schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-02-28', deliveryDate: '2027-03-10' },
      settings: { mode: 'online', demandSummary: '기후 대응 예산을 늘려 주세요.', goal: 3000, countDisplay: 'count_and_rate', regionalCounts: true, hostJoin: 'ask', fields: ['nickname', 'region'], deliveryNotice: true, deliveryTarget: '각 구의회', slots: {}, blockToolId: null, ...over.settings },
      publish: 'now', showUpcoming: true, hero: false, createdAt: '',
    },
    status: 'recruiting', phase: null,
    counts: { participants: 1047, waitlisted: 0, seatsTaken: 1047, capacity: null, seatsLeft: null, subscribers: 0 },
    myParticipation: over.mine ? { id: 'p1', state: 'signed', companions: 0, waitlistNo: null, consents: {}, answers: {}, createdAt: '', simDate: '2027-01-10', transport: '', startMeasurementId: null, pausedFrom: null, pausedUntil: null, pauseUsed: false, paused: false, ...over.mine } : null,
    missions: [], checklist: [], files: [], tools: [],
    explainer: { id: 'e1', title: '왜 이 요구안을 냈나요', body: '예산서에서 기후 항목은 2% 안팎이었어요.', attachments: [], createdAt: '' },
    subscribed: !!over.subscribed,
  };
}

const open = (date: string, url = '/campaigns/c1') => {
  simStore.set({ fixedDate: date });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/campaigns/:id" element={<CampaignDetailPage />} /></Routes>
      <ToastHost />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ userId: 'u1', nickname: '햇빛부자', role: 'member' });
  detail = makeDetail();
  agg = { count: 1047, byRegion: [{ name: '서울 마포구', n: 212 }, { name: '강원 원주시', n: 98 }], other: { regions: 41, n: 424 } };
  delivery = { delivery: null };
});

describe('signature campaign', () => {
  test('open view shows count, goal bar and regional counts', async () => {
    open('2027-01-20');
    expect(await screen.findByRole('button', { name: '서명하기' })).toBeTruthy();
    expect((await screen.findAllByText(/1,047/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('35');
    expect(await screen.findByText('서울 마포구')).toBeTruthy();
    expect(screen.getByText('그 밖 41곳')).toBeTruthy();
    expect(screen.getByText('기후 대응 예산을 늘려 주세요.')).toBeTruthy();
    expect(screen.getByText(/예산서에서 기후 항목은/)).toBeTruthy();
  });

  test('hidden count shows a gathering message instead of numbers', async () => {
    detail = makeDetail({ settings: { countDisplay: 'hidden' } });
    agg = { count: null, byRegion: [], other: { regions: 0, n: 0 } };
    open('2027-01-20');
    expect(await screen.findByText('서명이 모이고 있어요')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  test('signed view shows ordinal of my signature', async () => {
    detail = makeDetail({ mine: { signatureNo: 1047, referredCount: 2 } });
    open('2027-01-20');
    expect(await screen.findByText('서명했어요! 1,047번째 서명이에요')).toBeTruthy();
    expect(screen.getByText('이어서 해 보세요')).toBeTruthy();
    expect(screen.getByText(/링크로 2명이 서명했어요/)).toBeTruthy();
    expect(screen.getByText('서명 완료')).toBeTruthy();
  });

  test('share link credits referrer', async () => {
    expect(buildShareUrl('c1', 'u1')).toMatch(/#\/campaigns\/c1\?ref=u1$/);
    open('2027-01-20', '/campaigns/c1?ref=u9');
    fireEvent.click(await screen.findByRole('button', { name: '서명하기' }));
    const dlg = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dlg).getByText(/강원 원주시/)).toBeTruthy());
    fireEvent.click(within(dlg).getByRole('button', { name: '서명하기' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/campaigns/c1/participate')).toBe(true));
    expect(calls.find((c) => c.path === '/api/campaigns/c1/participate')!.opts!.body!.sharedBy).toBe('u9');
  });

  test('share button copies my link', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    open('2027-01-20');
    fireEvent.click(await screen.findByRole('button', { name: '공유하기' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect((writeText.mock.calls[0] as unknown as string[])[0]).toMatch(/#\/campaigns\/c1\?ref=u1$/);
    expect(await screen.findByText('링크를 복사했어요')).toBeTruthy();
  });

  test('cancel only before close', async () => {
    detail = makeDetail({ mine: { signatureNo: 3, referredCount: 2 } });
    const r = open('2027-02-01');
    fireEvent.click(await screen.findByRole('button', { name: '서명 취소' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText('서명을 취소할까요?')).toBeTruthy();
    expect(within(dlg).getByText(/서명 2건은 그대로 남아요/)).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: '서명 취소' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/participations/p1/cancel' && c.opts?.method === 'POST')).toBe(true));
    expect(await screen.findByText('서명을 취소했어요')).toBeTruthy();
    r.unmount();

    // 마감 뒤에는 취소 버튼이 없다
    detail = makeDetail({ mine: { signatureNo: 3 } });
    open('2027-03-01');
    expect((await screen.findAllByText(/명 서명/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '서명 취소' })).toBeNull();
  });

  test('closed view lists delivery answers and pending count', async () => {
    detail = makeDetail();
    delivery = {
      delivery: {
        id: 'd1', summary: '46개 의회의 예산 담당 위원회에 전달했어요.', councils: Array.from({ length: 46 }, (_, i) => `의회${i}`), photoFileId: null, createdAt: '',
        answers: [
          { id: 'a1', council: '의회0', date: '2027-03-17', body: '시민 의견을 듣는 절차를 검토하겠습니다.' },
          { id: 'a2', council: '의회1', date: '2027-03-15', body: '본예산 심의 때 논의하겠습니다.' },
        ],
      },
    };
    open('2027-03-20');
    expect(await screen.findByText('46개 의회의 예산 담당 위원회에 전달했어요.')).toBeTruthy();
    expect(screen.getByText('시민 의견을 듣는 절차를 검토하겠습니다.')).toBeTruthy();
    expect(screen.getByText('전달처 답변 2 / 46')).toBeTruthy();
    expect(screen.getByText(/아직 답변이 없는 의회 44곳/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '서명하기' })).toBeNull();
  });

  test('closed view without delivery does not claim delivery', async () => {
    detail = makeDetail({ mine: { signatureNo: 3 } });
    open('2027-03-05');
    expect(await screen.findByText('내 서명이 전달 명단에 있어요')).toBeTruthy();
    expect(screen.queryByText('내 서명이 전달됐어요')).toBeNull();
  });

  test('closed view offers joining the host group', async () => {
    open('2027-03-20');
    fireEvent.click(await screen.findByRole('button', { name: '주최 모임 소식 받기' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/groups/g1/join' && c.opts?.method === 'POST')).toBe(true));
    expect(screen.queryByRole('button', { name: '다음 서명 알림 받기' })).toBeNull();
  });

  test('closed view without host group hides the button', async () => {
    detail = makeDetail();
    (detail.campaign as Record<string, unknown>).host = { type: 'igt', name: '녹색전환연구소' };
    (detail.campaign as Record<string, unknown>).hostGroupId = null;
    open('2027-03-20');
    expect(await screen.findByText(/다음 서명은 홈에서 알려 드려요/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '주최 모임 소식 받기' })).toBeNull();
    expect(screen.queryByText(/주최 모임에 가입하면/)).toBeNull();
  });

  test('explainer shows written date; hidden count hides the ordinal', async () => {
    (detail.explainer as Record<string, unknown>).simDate = '2027-01-04';
    open('2027-01-20');
    expect(await screen.findByText(/기후정책 아카데미 동문 모임 · 1\. 4\. 작성/)).toBeTruthy();
  });

  test('hidden count signed view omits the ordinal', async () => {
    detail = makeDetail({ settings: { countDisplay: 'hidden' }, mine: { signatureNo: 7 } });
    agg = { count: null, byRegion: [], other: { regions: 0, n: 0 } };
    open('2027-01-20');
    expect(await screen.findByText('서명했어요!')).toBeTruthy();
    expect(screen.queryByText(/7번째/)).toBeNull();
  });
});
