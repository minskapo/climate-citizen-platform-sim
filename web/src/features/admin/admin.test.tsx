import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastHost } from '../../components/Toast';
import { __reloadSimForTest, simStore } from '../../lib/sim';
import { AttendanceQrModal, QR_REFRESH_MS } from './AttendanceQrModal';
import { DeliveryListPrint } from './DeliveryListPrint';
import { OfflineRoster } from './OfflineRoster';
import { dueLabel, ReportsCollab } from './ReportsCollab';
import { SignersPage } from './SignersPage';
import { UploadToolModal } from './UploadToolModal';
import { WebTools } from './WebTools';

type Opts = { method?: string; body?: Record<string, unknown> };
const calls: Array<{ path: string; opts?: Opts }> = [];
let codeSeq = 0;
let attended = false;
let attendedAt: { at: string; method: string } | null = null;
let collabItems: Array<Record<string, unknown>> = [];
let reportItems: Array<Record<string, unknown>> = [];
let toolItems: Array<Record<string, unknown>> = [];

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async (t: string) => `data:image/png;base64,${btoa(t)}`) } }));
vi.mock('../../lib/api', () => ({
  ApiError: class extends Error { status = 0; },
  API_BASE: '',
  simHeaders: () => ({}),
  downloadBlob: vi.fn(),
  api: vi.fn(async (path: string, opts?: Opts) => {
    calls.push({ path, opts });
    if (path === '/api/campaigns/o1') {
      return {
        campaign: { id: 'o1', type: 'offline', title: '옥상 태양광 탐방', host: { name: '마포 햇빛발전 시민 모임' }, schedule: { eventDate: '2027-01-25', eventStart: '14:00', eventEnd: '16:00' }, settings: { attendance: 'qr', capacity: 20, place: { public: '마포구' } } },
        status: 'running', counts: { participants: 2, waitlisted: 0, seatsTaken: 3, capacity: 20, seatsLeft: 17, attendedCount: 2 }, checklist: [],
      };
    }
    if (path === '/api/campaigns/s1') {
      return { campaign: { id: 's1', type: 'signature', title: '기후예산 서명', host: { name: '연구소' }, schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-02-28' }, settings: { goal: 100 } }, status: 'recruiting', counts: { participants: 3 }, checklist: [] };
    }
    if (path.startsWith('/api/admin/campaigns/o1/participants')) {
      const base = { sigungu: '', startTotal: null, endTotal: null, recordCount: 0, reminderOn: true, checklistDone: 0, research: false, sharedCount: 0, hostJoin: 'none', state: 'applied', appliedOn: '2027-01-05' };
      return {
        items: [
          { ...base, id: 'p1', userId: 'u1', nickname: '초록걸음', region: '강원', companions: 1, photo: true, attendance: { at: '2027-01-25T13:15', method: 'qr' } },
          { ...base, id: 'p2', userId: 'u2', nickname: '바람개비', region: '서울', companions: 0, photo: false, attendance: attended ? attendedAt : null },
          { ...base, id: 'p3', userId: 'u3', nickname: '대기자', region: '서울', companions: 0, photo: true, state: 'waitlisted', attendance: null },
        ],
        counts: { all: 3, waitlisted: 1, cancelled: 0 },
      };
    }
    if (path.startsWith('/api/admin/campaigns/s1/participants')) {
      const base = { startTotal: null, endTotal: null, recordCount: 0, reminderOn: true, checklistDone: 0, research: true, sharedCount: 0, hostJoin: 'none', state: 'signed', appliedOn: '2027-01-19', companions: 0, attendance: null, photo: false };
      return {
        items: [
          { ...base, id: 'a', userId: 'a', nickname: '햇빛부자', region: '강원특별자치도', sigungu: '원주시' },
          { ...base, id: 'b', userId: 'b', nickname: '바람개비', region: '서울특별시', sigungu: '마포구', hostJoin: 'pending' },
          { ...base, id: 'c', userId: 'c', nickname: '시군구없음', region: '세종특별자치시', sigungu: '' },
        ],
        counts: { all: 3, cancelled: 0 },
      };
    }
    if (path === '/api/campaigns/o1/attendance-code') return { code: String(111111 + codeSeq++), open: true, mode: 'qr' };
    if (path.startsWith('/api/participations/p2/attend-manual')) { attended = true; attendedAt = { at: '2027-01-25T13:40', method: 'manual' }; return { attended: true }; }
    if (path.startsWith('/api/participations/p2/unattend')) { attended = false; return { attended: false }; }
    if (path === '/api/admin/campaigns/s1/delivery-list') {
      return { title: '기후예산 서명', councils: [
        { name: '마포구의회', count: 1, items: [{ nickname: '바람개비', region: '서울특별시 마포구', signedOn: '2027-01-19' }] },
        { name: '세종특별자치시의회', count: 1, items: [{ nickname: '시군구없음', region: '세종특별자치시', signedOn: '2027-01-19' }] },
      ] };
    }
    if (path === '/api/admin/reports') return { items: reportItems };
    if (path === '/api/admin/collab') return { items: collabItems };
    if (path.startsWith('/api/admin/reports/')) { reportItems = reportItems.map((r) => ({ ...r, status: 'hidden' })); return { ok: true }; }
    if (path === '/api/tools' && !opts?.body) return { items: toolItems };
    if (path.startsWith('/api/tools')) return { version: 2, status: 'pending' };
    return {};
  }),
}));

const mount = (ui: React.ReactElement, url = '/') => render(<MemoryRouter initialEntries={[url]}>{ui}<ToastHost /></MemoryRouter>);

beforeEach(() => {
  calls.length = 0; codeSeq = 0; attended = false; attendedAt = null;
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ role: 'admin', userId: 'ad', nickname: '김민석', fixedDate: '2027-01-25' });
  collabItems = []; reportItems = []; toolItems = [];
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('offline roster', () => {
  test('roster manual check toggles attendance', async () => {
    mount(<OfflineRoster id="o1" />);
    const row = (await screen.findByText('바람개비')).closest('tr')!;
    expect(within(row).getByText('아직')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: '출석 체크' }));
    expect(await within((await screen.findByText('바람개비')).closest('tr')!).findByText('13:40 · 명단')).toBeTruthy();
    expect(calls.some((c) => c.path === '/api/participations/p2/attend-manual' && c.opts?.method === undefined)).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: '체크 취소' }));
    await waitFor(() => expect(within(screen.getByText('바람개비').closest('tr')!).getByText('아직')).toBeTruthy());
    expect(calls.some((c) => c.path === '/api/participations/p2/unattend')).toBe(true);
  });

  test('stats count people with companions; QR rows have no cancel', async () => {
    mount(<OfflineRoster id="o1" />);
    await screen.findByText('초록걸음');
    const stat = screen.getByText('출석', { selector: 'span' }).closest('[role=listitem]') as HTMLElement;
    expect(within(stat).getByText('2명')).toBeTruthy(); // 초록걸음 + 동반 1
    expect(screen.getByText('3 / 20명')).toBeTruthy();
    const row = screen.getByText('초록걸음').closest('tr')!;
    expect(within(row).queryByRole('button')).toBeNull();
    expect(within(row).getByText('13:15 · QR')).toBeTruthy();
  });
});

describe('attendance QR modal', () => {
  test('qr modal refreshes code every minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AttendanceQrModal campaignId="o1" start="14:00" end="16:00" onClose={() => undefined} />);
    expect(await screen.findByText('111111')).toBeTruthy();
    const img = await screen.findByAltText('출석 QR');
    const url = atob(img.getAttribute('src')!.split(',')[1]);
    expect(url).toContain('#/attend/o1?code=111111');
    expect(url.startsWith(location.origin)).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(QR_REFRESH_MS); });
    expect(await screen.findByText('111112')).toBeTruthy();
    expect(atob((await screen.findByAltText('출석 QR')).getAttribute('src')!.split(',')[1])).toContain('code=111112');
    expect(screen.getByText(/지금 출석 2 \/ 3명/)).toBeTruthy();
    expect(screen.getByText(/13:00 – 17:00에 열려요/)).toBeTruthy();
  });
});

describe('web tools', () => {
  test('upload rejects html over 1MB', async () => {
    const done = vi.fn();
    render(<UploadToolModal onClose={() => undefined} onDone={done} />);
    const big = new File(['x'], 'big.html', { type: 'text/html' });
    Object.defineProperty(big, 'size', { value: 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText('HTML 파일'), { target: { files: [big] } });
    expect(await screen.findByText('HTML은 1MB 이하만 올릴 수 있어요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '게시 대기로 올리기' }));
    expect(calls.some((c) => c.path === '/api/tools')).toBe(false);
    expect(done).not.toHaveBeenCalled();
  });

  test('upload sends html with the manifest fields', async () => {
    render(<UploadToolModal onClose={() => undefined} onDone={() => undefined} />);
    fireEvent.change(screen.getByLabelText('HTML 파일'), { target: { files: [new File(['<p>hi</p>'], 'a.html', { type: 'text/html' })] } });
    await screen.findByText(/HTML을 읽었어요/);
    fireEvent.change(screen.getByPlaceholderText('예: 자전거 이동 기록 도구'), { target: { value: '자전거 도구' } });
    fireEvent.change(screen.getByPlaceholderText('bike-log'), { target: { value: 'bike-log' } });
    fireEvent.click(screen.getByRole('radio', { name: '페이지형' }));
    fireEvent.click(screen.getByLabelText('기록 저장'));
    fireEvent.change(screen.getByPlaceholderText('date, mode, km'), { target: { value: 'date, km' } });
    fireEvent.click(screen.getByRole('button', { name: '+ 집계 값 추가' }));
    fireEvent.change(screen.getByLabelText('집계 값 이름 1'), { target: { value: 'km' } });
    fireEvent.click(screen.getByRole('button', { name: '게시 대기로 올리기' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/tools' && c.opts?.body)).toBe(true));
    expect(calls.find((c) => c.path === '/api/tools' && c.opts?.body)?.opts?.body).toEqual({
      name: '자전거 도구', slug: 'bike-log', kind: 'page', html: '<p>hi</p>',
      manifest: { permissions: ['record'], saveKeys: ['date', 'km'], aggregateKeys: [{ key: 'km', op: 'sum' }], startPoint: false },
    });
  });

  test('pending version publishes after a confirm; archived version rolls back after a confirm', async () => {
    const m = { permissions: ['record'], saveKeys: ['km'], aggregateKeys: [], startPoint: false };
    toolItems = [{
      id: 't1', name: '자전거 도구', slug: 'bike-log', kind: 'page', createdAt: '', published: { version: 2 }, usedBy: [{ id: 'c', title: '자전거 출퇴근 한 달' }],
      versions: [
        { version: 3, status: 'pending', createdAt: '2027-01-17T00:00:00Z', manifest: m, htmlBytes: 10 },
        { version: 2, status: 'published', createdAt: '2027-01-09T00:00:00Z', manifest: m, htmlBytes: 10 },
        { version: 1, status: 'archived', createdAt: '2026-12-28T00:00:00Z', manifest: m, htmlBytes: 10 },
      ],
    }];
    mount(<WebTools />);
    fireEvent.click(await screen.findByRole('button', { name: 'v3 게시하기' }));
    expect(await screen.findByText('v3을 게시할까요?')).toBeTruthy();
    expect(calls.some((c) => c.path.endsWith('/publish'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '게시하기' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/tools/t1/versions/3/publish')).toBe(true));
    expect(await screen.findByText(/v3을 게시했어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'v1로 되돌리기' }));
    expect(await screen.findByText('v1로 되돌릴까요?')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'v1로 되돌리기' }).at(-1)!);
    await waitFor(() => expect(calls.find((c) => c.path === '/api/tools/t1/rollback')?.opts?.body).toEqual({ toVersion: 1 }));
  });
});

describe('reports and collab', () => {
  test('reports hide notifies author when chosen', async () => {
    reportItems = [{ id: 'r1', targetType: 'post', targetId: 'p', reason: '광고', status: 'open', createdAt: '2027-01-16T03:00:00Z', reporter: '신고자', preview: '공동구매 하실 분', targetHidden: false }];
    mount(<ReportsCollab />);
    fireEvent.click(await screen.findByRole('button', { name: /숨기기/ }));
    expect(await screen.findByText('이 게시글을 숨길까요?')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '저작권' }));
    fireEvent.click(screen.getByLabelText(/작성자에게 알리기/));
    fireEvent.click(screen.getByLabelText(/작성자에게 알리기/));
    fireEvent.click(screen.getAllByRole('button', { name: '숨기기' }).at(-1)!);
    await waitFor(() => expect(calls.find((c) => c.path === '/api/admin/reports/r1')?.opts?.body).toEqual({ action: 'hide', reason: '저작권', notify: true }));
    expect(await screen.findByText('숨겼어요 · 작성자에게 이유를 알렸어요')).toBeTruthy();
  });

  test('hide without notify sends notify=false', async () => {
    reportItems = [{ id: 'r1', targetType: 'comment', targetId: 'p', reason: '괴롭힘', status: 'open', createdAt: '2027-01-16T03:00:00Z', reporter: null, preview: '댓글', targetHidden: false }];
    mount(<ReportsCollab />);
    fireEvent.click(await screen.findByRole('button', { name: /숨기기/ }));
    fireEvent.click(await screen.findByLabelText(/작성자에게 알리기/));
    fireEvent.click(screen.getAllByRole('button', { name: '숨기기' }).at(-1)!);
    await waitFor(() => expect(calls.find((c) => c.path === '/api/admin/reports/r1')?.opts?.body).toEqual({ action: 'hide', reason: '괴롭힘', notify: false }));
  });

  test('collab shows due label 오늘까지/내일까지 by real time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2027, 0, 18, 15, 0));
    expect(dueLabel(new Date(2027, 0, 18, 23, 0).toISOString())).toBe('오늘까지 답변');
    expect(dueLabel(new Date(2027, 0, 19, 2, 0).toISOString())).toBe('내일까지 답변');
    expect(dueLabel(new Date(2027, 0, 17, 9, 0).toISOString())).toBe('답변 기한이 지났어요');
    collabItems = [
      { id: 'c1', title: '한뼘 2월 기획', idea: '함께 기획해요', period: '', size: '', status: 'open', dueAt: new Date(2027, 0, 18, 22, 0).toISOString(), createdAt: new Date(2027, 0, 17, 22, 0).toISOString(), author: '정치바람', groupName: null, campaignId: null, replies: [] },
      { id: 'c2', title: '수원 한달살기', idea: '수원에서도', period: '', size: '', status: 'open', dueAt: new Date(2027, 0, 19, 20, 0).toISOString(), createdAt: new Date(2027, 0, 18, 10, 0).toISOString(), author: '지구', groupName: '수원 지구로운 모임', campaignId: null, replies: [] },
    ];
    mount(<ReportsCollab initialTab="collab" />);
    expect(await screen.findByText(/오늘까지 답변/)).toBeTruthy();
    expect(screen.getByText(/내일까지 답변/)).toBeTruthy();
  });
});

describe('signers and delivery list', () => {
  test('signers table derives the council from the region with a province fallback', async () => {
    mount(<SignersPage id="s1" />);
    expect(await screen.findByText('원주시의회')).toBeTruthy();
    expect(screen.getByText('마포구의회')).toBeTruthy();
    expect(screen.getByText('세종특별자치시의회')).toBeTruthy();
    expect(screen.getByText('승인 대기')).toBeTruthy();
    expect(screen.getByText('3%')).toBeTruthy();
  });

  test('delivery list modal opens the printable screen and toasts', async () => {
    mount(
      <Routes>
        <Route path="/admin/campaigns/:id/participants" element={<SignersPage id="s1" />} />
        <Route path="/admin/campaigns/:id/delivery-list" element={<DeliveryListPrint />} />
      </Routes>, '/admin/campaigns/s1/participants');
    fireEvent.click(await screen.findByRole('button', { name: '전달용 명단 만들기' }));
    expect(await screen.findByText(/의회별로 모두 · 3개 의회/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '명단 만들기' }));
    expect(await screen.findByText('마포구의회 전달용 서명 명단')).toBeTruthy();
    expect(calls.find((c) => c.path === '/api/admin/campaigns/s1/delivery-list')?.opts?.body).toEqual({ council: 'all' });
    expect(screen.getByText(/전달용 명단을 만들었어요 · 3개 의회/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '인쇄하기' })).toBeTruthy();
    expect(screen.queryByText('연락처')).toBeNull();
  });
});
