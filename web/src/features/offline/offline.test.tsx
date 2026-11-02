import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CampaignDetailPage } from '../campaigns/CampaignDetailPage';
import { ToastHost } from '../../components/Toast';
import { __reloadSimForTest, simStore } from '../../lib/sim';
import { AttendRoute } from './AttendRoute';
import { buildIcs } from './util';

let detail: Record<string, unknown> = {};
let attendance: { at: string; method: string } | null = null;
let nextItems: Array<Record<string, unknown>> = [];
const calls: Array<{ path: string; opts?: { method?: string; body?: Record<string, unknown> } }> = [];
vi.mock('../../lib/api', () => ({
  ApiError: class extends Error { status = 0; },
  API_BASE: '',
  simHeaders: () => ({}),
  downloadBlob: vi.fn(),
  api: vi.fn(async (path: string, opts?: { method?: string; body?: Record<string, unknown> }) => {
    calls.push({ path, opts });
    if (path === '/api/campaigns/c1') return detail;
    if (path === '/api/campaigns/c1/attend') return { attended: true, at: '2027-01-25T13:32', method: 'qr' };
    if (path === '/api/participations/p1') return { participation: { id: 'p1', attendance } };
    if (path.startsWith('/api/campaigns?')) return { items: nextItems };
    if (path.startsWith('/api/groups')) return { id: 'g1', name: '마포 햇빛발전 시민 모임', sido: '서울', joinPolicy: 'open', memberCount: 86, myRole: 'member', categories: ['후기'] };
    if (path.startsWith('/api/boards/')) return { items: [] };
    return {};
  }),
}));

function makeDetail(over: { mine?: Record<string, unknown> | null; exact?: string; checklist?: unknown[] } = {}) {
  return {
    campaign: {
      id: 'c1', type: 'offline', title: '옥상 태양광 탐방 · 1월', summary: '옥상을 둘러봐요.', imageFileId: null,
      host: { type: 'group', id: 'g1', name: '마포 햇빛발전 시민 모임' }, hostGroupId: 'g1',
      schedule: { recruitStart: '2027-01-11', recruitEnd: '2027-01-23', recruitEndTime: '18:00', eventDate: '2027-01-25', eventStart: '14:00', eventEnd: '16:00' },
      settings: { mode: 'offline', place: { exact: over.exact ?? '', public: '마포구 성산동' }, capacity: 20, waitlist: true, supplies: '편한 신발, 모자, 물', attendance: 'qr', slots: {}, blockToolId: null },
      publish: 'now', showUpcoming: true, hero: false, createdAt: '',
    },
    status: 'recruiting', phase: null,
    counts: { participants: 18, waitlisted: 0, seatsTaken: 18, capacity: 20, seatsLeft: 2, subscribers: 0 },
    myParticipation: over.mine ? { id: 'p1', state: 'applied', companions: 0, waitlistNo: null, consents: {}, answers: {}, createdAt: '', simDate: '2027-01-10', transport: '', startMeasurementId: null, pausedFrom: null, pausedUntil: null, pauseUsed: false, paused: false, ...over.mine } : null,
    missions: [],
    checklist: over.checklist ?? [],
    files: [], tools: [], explainer: null, subscribed: false,
  };
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}{l.search}</p>;
}

const open = (date: string, time: string | null = null, url = '/campaigns/c1') => {
  simStore.set({ fixedDate: date, timeOverride: time as never });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/campaigns/:id" element={<><CampaignDetailPage /><Where /></>} />
        <Route path="/attend/:campaignId" element={<AttendRoute />} />
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
  detail = makeDetail();
  attendance = null;
  nextItems = [];
});

describe('offline campaign', () => {
  test('exact address hidden before applying', async () => {
    open('2027-01-20');
    expect(await screen.findByRole('button', { name: '참여 신청하기' })).toBeTruthy();
    expect(screen.getAllByText(/마포구 성산동/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/성미산로/)).toBeNull();
    expect(screen.getAllByText(/18 \/ 20명 신청/).length).toBeGreaterThan(0);
  });

  test('exact address shown after applying, with D-day and checklist actions', async () => {
    detail = makeDetail({ mine: {}, exact: '마포구 성미산로 12 3층 옥상', checklist: [
      { key: 'place', kind: 'auto', label: '장소와 오는 길 확인', done: false },
      { key: 'supplies', kind: 'auto', label: '준비물 확인', done: false },
    ] });
    open('2027-01-19');
    expect((await screen.findAllByText(/마포구 성미산로 12 3층 옥상/)).length).toBeGreaterThan(0);
    expect(screen.getByText('D-6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '확인했어요 →' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/campaigns/c1/checklist/supplies/done')).toBe(true));
    expect(await screen.findByText('준비물 확인을 체크했어요')).toBeTruthy();
  });

  test('attend link with code auto-submits', async () => {
    detail = makeDetail({ mine: {} });
    open('2027-01-25', '13:30', '/attend/c1?code=123456');
    await waitFor(() => expect(calls.find((c) => c.path === '/api/campaigns/c1/attend')?.opts?.body).toEqual({ code: '123456' }));
    expect(await screen.findByText('출석했어요!')).toBeTruthy();
    expect(screen.getByText(/13:32 · 옥상 태양광 탐방/)).toBeTruthy();
  });

  test('attend link for a non-participant goes to the campaign page with a message', async () => {
    open('2027-01-25', '13:30', '/attend/c1?code=123456');
    expect(await screen.findByText(/신청이 확정된 참가자만 출석할 수 있어요/)).toBeTruthy();
    expect(calls.some((c) => c.path === '/api/campaigns/c1/attend')).toBe(false);
  });

  test('attendance closed outside window shows opening time', async () => {
    detail = makeDetail({ mine: {} });
    open('2027-01-25', '11:00');
    fireEvent.click(await screen.findByRole('button', { name: 'QR 찍고 출석하기' }));
    expect((await screen.findAllByText('출석은 13:00부터 열려요')).length).toBeGreaterThan(0);
    const input = screen.getByLabelText('출석 코드');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(calls.some((c) => c.path === '/api/campaigns/c1/attend')).toBe(false);
  });

  test('event day shows live attendance count when the server sends it', async () => {
    detail = makeDetail({ mine: {} });
    (detail.counts as Record<string, unknown>).attendedCount = 12;
    open('2027-01-25', '13:30');
    expect(await screen.findByText('지금 출석 12 / 18명')).toBeTruthy();
  });

  test('code entry inside the window attends and shows the done dialog', async () => {
    detail = makeDetail({ mine: {} });
    open('2027-01-25', '13:30');
    fireEvent.click(await screen.findByRole('button', { name: 'QR 찍고 출석하기' }));
    fireEvent.change(screen.getByLabelText('출석 코드'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: '출석하기' }));
    expect(await screen.findByText('출석했어요!')).toBeTruthy();
    expect(calls.find((c) => c.path === '/api/campaigns/c1/attend')?.opts?.body).toEqual({ code: '654321' });
  });

  test('after view suggests host group recruiting campaigns', async () => {
    detail = makeDetail({ mine: {} });
    attendance = { at: '2027-01-25T13:32', method: 'qr' };
    nextItems = [
      { id: 'c2', type: 'offline', title: '옥상 태양광 탐방 · 3월', summary: '', imageFileId: null, host: { type: 'group', id: 'g1', name: '마포' }, mode: 'offline', schedule: { eventDate: '2027-03-22' }, status: 'recruiting', participantCount: 3, hero: false },
      { id: 'c1', type: 'offline', title: '자기 자신', summary: '', imageFileId: null, host: { type: 'group', id: 'g1', name: '마포' }, mode: 'offline', schedule: {}, status: 'recruiting', participantCount: 0, hero: false },
    ];
    open('2027-01-26');
    expect(await screen.findByText('함께해 주셔서 고마워요!')).toBeTruthy();
    expect(await screen.findByText('옥상 태양광 탐방 · 3월')).toBeTruthy();
    expect(screen.queryByText('자기 자신')).toBeNull();
    expect(calls.some((c) => c.path.startsWith('/api/campaigns?hostGroupId=g1&status=recruiting'))).toBe(true);
    expect(screen.getByRole('link', { name: '참여 확인서 받기' }).getAttribute('href')).toBe('/campaigns/c1/certificate');
  });

  test('calendar file carries title, date, time and public place', () => {
    const ics = buildIcs(makeDetail() as never, '2027-01-19');
    expect(ics).toContain('SUMMARY:옥상 태양광 탐방 · 1월');
    expect(ics).toContain('DTSTART;TZID=Asia/Seoul:20270125T140000');
    expect(ics).toContain('DTEND;TZID=Asia/Seoul:20270125T160000');
    expect(ics).toContain('LOCATION:마포구 성산동');
  });
});
