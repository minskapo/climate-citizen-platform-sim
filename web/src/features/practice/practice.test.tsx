import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CampaignDetailPage } from '../campaigns/CampaignDetailPage';
import { ToastHost } from '../../components/Toast';
import { __reloadSimForTest, simStore } from '../../lib/sim';

let detail: Record<string, unknown> = {};
let records: Record<string, unknown> = {};
const calls: string[] = [];
vi.mock('../../lib/api', () => ({
  ApiError: class extends Error { status = 0; },
  API_BASE: '',
  simHeaders: () => ({}),
  downloadBlob: vi.fn(),
  api: vi.fn(async (path: string) => {
    calls.push(path);
    if (path.startsWith('/api/campaigns/c1/today-count')) return { date: '', count: 4 };
    if (path === '/api/campaigns/c1') return detail;
    if (path.startsWith('/api/participations/p1/records')) return records;
    if (path.startsWith('/api/me/measurements')) return { items: [{ id: 'm1', simDate: '2027-01-10', createdAt: '', campaignId: 'c1', kind: 'start', result: { total: 11.2 } }] };
    if (path.startsWith('/api/boards/')) return { items: [], nextCursor: null };
    if (path === '/api/groups/g1') return { id: 'g1', myRole: null, joinPolicy: 'open', closed: false };
    if (path === '/api/groups/g1/join') return { role: 'member' };
    if (path.startsWith('/api/groups')) return { items: [] };
    if (path.startsWith('/api/aggregates')) return { avg: null };
    return {};
  }),
}));

const MISSIONS = [1, 2, 3, 4].map((round) => ({ id: `m${round}`, round, date: null, category: ['이동', '먹거리', '에너지', '소비'][round - 1], title: `${round}주차 미션`, extraFields: [] }));

function makeDetail(settings: Record<string, unknown> = {}, mine: Record<string, unknown> | null = null) {
  return {
    campaign: {
      id: 'c1', type: 'practice', title: '새해 1.5도 한달살기', summary: '함께 실천해요.', imageFileId: null,
      host: { type: 'igt', name: '녹색전환연구소' }, hostGroupId: null,
      schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-01-31', runStart: '2027-02-08', runDays: 28 },
      settings: { mode: 'online', recordEnabled: true, missionCycle: 'weekly', recordCycle: 'daily', recordFields: ['check', 'memo'], missedAlert: true, startPoint: { enabled: false, toolId: 'calculator' }, slots: {}, blockToolId: null, ...settings },
      publish: 'now', showUpcoming: true, hero: false, createdAt: '',
    },
    status: 'recruiting', phase: 'before',
    counts: { participants: 12, waitlisted: 0, seatsTaken: 12, capacity: null, seatsLeft: null, subscribers: 3 },
    myParticipation: mine ? { id: 'p1', state: 'applied', companions: 0, waitlistNo: null, consents: {}, answers: {}, createdAt: '', simDate: '2027-01-10', transport: '', startMeasurementId: null, pausedFrom: null, pausedUntil: null, pauseUsed: false, paused: false, ...mine } : null,
    missions: MISSIONS, checklist: [], files: [], tools: [], explainer: null, subscribed: false,
  };
}

const daily28 = Array.from({ length: 28 }, (_, i) => { const d = new Date(Date.UTC(2027, 1, 8 + i)); return d.toISOString().slice(0, 10); });
function makeRecords(over: Record<string, unknown> = {}) {
  return { records: [], slots: daily28, pausedDates: [], backfillable: [], nextSlot: null, isSlotToday: true, progress: { done: 0, total: 28, dueSoFar: 1, streak: 0 }, missedStreak: 0, ...over };
}

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}</p>; }
const open = (date: string, url = '/campaigns/c1') => {
  simStore.set({ fixedDate: date });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="/calculator" element={<Where />} />
      </Routes>
      <ToastHost />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ userId: 'u1', nickname: '햇빛부자', role: 'member' });
  records = makeRecords();
});

describe('practice campaign', () => {
  test('status differs per viewer date', async () => {
    detail = makeDetail();
    const a = open('2027-01-10');
    expect(await screen.findByRole('button', { name: '참여 신청하기' })).toBeInTheDocument();
    expect(screen.getAllByText('모집 중').length).toBeGreaterThan(0);
    a.unmount();
    open('2027-02-10');
    expect(await screen.findByRole('button', { name: '모집이 끝났어요' })).toBeDisabled();
    expect(screen.getAllByText('진행 중').length).toBeGreaterThan(0);
    // 진행 중 · 마감에는 「알림 받기」가 실제로 알려 주지 않으므로 보이지 않는다.
    expect(screen.queryByRole('button', { name: /알림 받기/ })).toBeNull();
  });

  test('running campaign with a linked host group offers 주최 모임 소식 받기 instead', async () => {
    detail = makeDetail();
    (detail.campaign as Record<string, unknown>).host = { type: 'group', id: 'g1', name: '원주 모임' };
    (detail.campaign as Record<string, unknown>).hostGroupId = 'g1';
    open('2027-02-10');
    fireEvent.click(await screen.findByRole('button', { name: '주최 모임 소식 받기' }));
    await waitFor(() => expect(calls).toContain('/api/groups/g1/join'));
    expect(await screen.findByText('주최 모임에 가입했어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /알림 받기/ })).toBeNull();
  });

  test('scheduled shows 알림 받기 and subscriber count', async () => {
    detail = makeDetail();
    open('2027-01-01');
    expect(await screen.findByRole('button', { name: '알림 받기' })).toBeInTheDocument();
    expect(screen.getByText('명 알림 신청')).toBeInTheDocument();
  });

  test('weekly cycle shows 이번 주 미션 and next record date on off days', async () => {
    detail = makeDetail({ recordCycle: 'weekly' }, {});
    records = makeRecords({ slots: ['2027-02-14', '2027-02-21', '2027-02-28', '2027-03-07'], isSlotToday: false, nextSlot: '2027-02-14', progress: { done: 0, total: 4, dueSoFar: 0, streak: 0 } });
    open('2027-02-10');
    expect(await screen.findByText('이번 주 미션: 1주차 미션')).toBeInTheDocument();
    expect(await screen.findByText('다음 기록일 2. 14.(일)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '기록 저장' })).toBeNull();
  });

  test('daily slot day shows the record form', async () => {
    detail = makeDetail({}, {});
    open('2027-02-10');
    expect(await screen.findByRole('button', { name: '기록 저장' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '했어요' })).toBeInTheDocument();
    expect(screen.getByText('오늘 4명 기록')).toBeInTheDocument();
  });

  test('saving a record reloads today proofs on the board', async () => {
    detail = makeDetail({}, {});
    open('2027-02-10');
    fireEvent.click(await screen.findByRole('radio', { name: '했어요' }));
    const boardCalls = () => calls.filter((c) => c.startsWith('/api/boards/campaign/c1')).length;
    await waitFor(() => expect(boardCalls()).toBeGreaterThan(0));
    const before = boardCalls();
    fireEvent.click(screen.getByRole('button', { name: '기록 저장' }));
    await waitFor(() => expect(boardCalls()).toBeGreaterThan(before));
  });

  test('comeback banner after 3 missed slots', async () => {
    detail = makeDetail({}, {});
    records = makeRecords({ missedStreak: 2 });
    const a = open('2027-02-20');
    expect(await screen.findByRole('button', { name: '기록 저장' })).toBeInTheDocument();
    expect(screen.queryByText('이틀 동안 기록이 없었어요')).toBeNull();
    a.unmount();
    records = makeRecords({ missedStreak: 3, backfillable: ['2027-02-18', '2027-02-19'] });
    open('2027-02-20');
    expect(await screen.findByText('사흘 동안 기록이 없었어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지난 기록 채우기 (2일 전까지)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이번 주는 쉬어 가기 →' })).toBeInTheDocument();
  });

  test('final view on last day offers re-measure', async () => {
    detail = makeDetail({ startPoint: { enabled: true, toolId: 'calculator' } }, { startMeasurementId: 'm1' });
    records = makeRecords({ progress: { done: 26, total: 28, dueSoFar: 28, streak: 3 } });
    open('2027-03-07');
    expect(await screen.findByText('4주를 함께 마쳤어요!')).toBeInTheDocument();
    expect(await screen.findByText('28일 중 26일을 기록했어요. 마지막으로 다시 재서 얼마나 줄었는지 확인해 보세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '후기 올리기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1.5도 계산기로 다시 재기' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/calculator?from=campaign&campaignId=c1&kind=end');
  });

  test('block placed at configured slot only', async () => {
    detail = makeDetail({ blockToolId: 't1', slots: { detail: 'after_common', running: 'top' } });
    const { container } = open('2027-01-10');
    await screen.findByRole('button', { name: '참여 신청하기' });
    const blocks = container.querySelectorAll('[data-block-slot]');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].getAttribute('data-block-slot')).toBe('after_common');
    expect(blocks[0].getAttribute('data-block-screen')).toBe('detail');
  });

  test('participant tabs switch via ?tab=', async () => {
    detail = makeDetail({}, {});
    open('2027-02-10', '/campaigns/c1?tab=records');
    expect(await screen.findByRole('button', { name: '내 기록 내려받기' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '내 기록' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '오늘' }));
    expect(await screen.findByRole('button', { name: '기록 저장' })).toBeInTheDocument();
  });

  test('before start shows completion banner from location state', async () => {
    detail = makeDetail({}, {});
    simStore.set({ fixedDate: '2027-01-20' });
    render(
      <MemoryRouter initialEntries={[{ pathname: '/campaigns/c1', state: { completed: true } }]}>
        <Routes><Route path="/campaigns/:id" element={<CampaignDetailPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('신청이 완료됐어요!')).toBeInTheDocument();
    expect(screen.getByText('D-19')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.startsWith('/api/participations/p1/records'))).toBe(true));
  });
});
