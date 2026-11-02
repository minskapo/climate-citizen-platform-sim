import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastHost } from '../../../components/Toast';
import { simStore } from '../../../lib/sim';
import { CampaignEditor } from './CampaignEditor';
import { summarySentence } from './model';

type Opts = { method?: string; body?: Record<string, unknown> };
const calls: Array<{ path: string; opts?: Opts }> = [];
let failNext: { field: string; message: string } | null = null;

vi.mock('../../../lib/api', () => {
  class ApiError extends Error {
    constructor(public status: number, public code: string, message: string, public field?: string) { super(message); }
  }
  const detailFrom = (id: string, body: Record<string, unknown>) => ({
    campaign: {
      id, type: body.type, title: body.title, summary: body.summary, imageFileId: null, host: { type: 'igt', name: '녹색전환연구소' },
      hostGroupId: body.hostGroupId ?? null, schedule: body.schedule ?? {}, settings: body.settings ?? {}, publish: 'draft', showUpcoming: false, hero: false, createdAt: '',
    },
    status: 'draft', phase: null, counts: {}, myParticipation: null, missions: [], checklist: [], files: [], tools: [], explainer: null,
  });
  return {
    ApiError,
    API_BASE: '',
    simHeaders: () => ({}),
    downloadBlob: vi.fn(),
    api: vi.fn(async (path: string, opts?: Opts) => {
      calls.push({ path, opts });
      if (failNext && (path === '/api/campaigns' || path === '/api/campaigns/c1') && opts?.body) {
        const f = failNext;
        failNext = null;
        throw new ApiError(400, 'INVALID_SETTINGS', f.message, f.field);
      }
      if (path === '/api/tools') {
        return { items: [
          { id: 'b1', name: '진행 안내 블록', slug: null, kind: 'block', published: { version: 2, manifest: {} }, versions: [{ version: 2, status: 'published' }] },
          { id: 'p1', name: '자전거 이동 기록 도구', slug: 'bike-log', kind: 'page', published: { version: 1, manifest: { startPoint: true } }, versions: [] },
        ] };
      }
      if (path.startsWith('/api/groups')) return { items: [{ id: 'g1', name: '기후정책 아카데미 동문 모임', sido: '', joinPolicy: 'approval', memberCount: 58 }] };
      if (path.startsWith('/api/campaigns?hero=1')) return { items: [] };
      if (path === '/api/campaigns' && opts?.body) return detailFrom('c1', opts.body);
      if (path === '/api/campaigns/c1' && opts?.method === 'PUT') return detailFrom('c1', opts.body!);
      if (path === '/api/campaigns/c1/publish') return { ...detailFrom('c1', { type: 'practice' }), status: 'scheduled' };
      return {};
    }),
  };
});

const open = (url = '/admin/campaigns/new?type=practice') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/admin/campaigns/new" element={<CampaignEditor />} />
        <Route path="/admin/campaigns/:id/edit" element={<CampaignEditor />} />
        <Route path="/admin/campaigns" element={<p>목록 화면</p>} />
      </Routes>
      <ToastHost />
    </MemoryRouter>,
  );

const group = (name: string) => screen.getByRole('group', { name });
const lastBody = (path: string) => [...calls].reverse().find((c) => c.path === path && c.opts?.body)?.opts?.body as Record<string, any>;

beforeEach(() => {
  calls.length = 0;
  failNext = null;
  simStore.set({ role: 'admin', userId: 'u1', nickname: '김민석', fixedDate: '2026-12-20', dateOffsetDays: 0, timeOverride: '14:32' });
});

describe('admin campaign editor', () => {
  test('switching type keeps common fields and swaps sections', async () => {
    open();
    fireEvent.change(screen.getByLabelText('캠페인 이름'), { target: { value: '새해 1.5도 한달살기' } });
    fireEvent.click(within(group('방식')).getByRole('button', { name: '온·오프라인' }));
    expect(screen.getByRole('heading', { name: '미션과 기록' })).toBeInTheDocument();

    // untouched type settings: switches right away
    fireEvent.click(within(group('유형')).getByRole('button', { name: '서명' }));
    expect(screen.getByLabelText('캠페인 이름')).toHaveValue('새해 1.5도 한달살기');
    expect(within(group('방식')).getByRole('button', { name: '온·오프라인' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('요구안 요약')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '미션과 기록' })).not.toBeInTheDocument();

    // edited type settings: asks before discarding
    fireEvent.change(screen.getByLabelText('요구안 요약'), { target: { value: '기후 예산을 늘려 주세요' } });
    fireEvent.click(within(group('유형')).getByRole('button', { name: '오프라인 모임' }));
    const dlg = await screen.findByRole('dialog', { name: '유형을 바꿀까요?' });
    fireEvent.click(within(dlg).getByRole('button', { name: '바꾸기' }));
    expect(screen.getByRole('heading', { name: '당일 운영' })).toBeInTheDocument();
    expect(screen.getByLabelText('캠페인 이름')).toHaveValue('새해 1.5도 한달살기');
  });

  test('summary sentence reflects cycles and duration', () => {
    expect(summarySentence({ recordEnabled: true, missionCycle: 'daily', recordCycle: 'daily' }, { runStart: '2027-02-08', runDays: 28 }))
      .toBe('미션은 매일 바뀌고, 매일 그날 미션을 실천했는지 체크해요 · 4주 동안 미션 28개, 기록 28번');
    open();
    fireEvent.change(screen.getByLabelText('진행 시작 날짜'), { target: { value: '2027-02-08' } });
    fireEvent.change(screen.getByLabelText('진행 기간'), { target: { value: '28' } });
    fireEvent.click(within(group('미션 주기')).getByRole('button', { name: '주마다 바뀜' }));
    expect(screen.getByText('미션은 매주 월요일에 바뀌고, 매일 그 주 미션을 실천했는지 체크해요 · 4주 동안 미션 4개, 기록 28번')).toBeInTheDocument();
    fireEvent.click(within(group('기록 주기')).getByRole('button', { name: '주 3회' }));
    expect(screen.getByText(/주 3번 그 주 미션을 실천했는지 체크해요 · 4주 동안 미션 4개, 기록 12번/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('진행 시작 날짜'), { target: { value: '2027-02-10' } });
    expect(screen.getByText(/미션은 매주 수요일에 바뀌고/)).toBeInTheDocument();
  });

  test('host link none hides host group picker and signature join option', async () => {
    open('/admin/campaigns/new?type=signature');
    expect(within(group('주최 모임 연결')).getByRole('button', { name: '연결하지 않음' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: '주최 모임 고르기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '주최 모임 가입' })).not.toBeInTheDocument();

    fireEvent.click(within(group('주최 모임 연결')).getByRole('button', { name: '모임 연결' }));
    const dlg = await screen.findByRole('dialog', { name: '주최 모임 고르기' });
    fireEvent.click(await within(dlg).findByRole('option', { name: /기후정책 아카데미 동문 모임/ }));
    fireEvent.click(within(dlg).getByRole('button', { name: '선택' }));
    expect(screen.getByRole('button', { name: '주최 모임 고르기' })).toHaveTextContent('기후정책 아카데미 동문 모임');
    expect(group('주최 모임 가입')).toBeInTheDocument();

    fireEvent.click(within(group('주최 모임 연결')).getByRole('button', { name: '연결하지 않음' }));
    expect(screen.queryByRole('button', { name: '주최 모임 고르기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '주최 모임 가입' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '임시 저장' }));
    await waitFor(() => expect(lastBody('/api/campaigns')).toBeTruthy());
    expect(lastBody('/api/campaigns').hostGroupId).toBeNull();
    expect(lastBody('/api/campaigns').settings.hostLink).toBe('none');
  });

  test('block placement per screen saved', async () => {
    open();
    await waitFor(() => expect(calls.some((c) => c.path === '/api/tools')).toBe(true));
    expect(screen.getByLabelText('진행 중', { selector: 'select' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '맞춤 영역 고르기' }));
    const dlg = await screen.findByRole('dialog', { name: '맞춤 영역 고르기' });
    fireEvent.click(within(dlg).getByRole('option', { name: /진행 안내 블록/ }));
    fireEvent.click(within(dlg).getByRole('button', { name: '선택' }));
    fireEvent.change(screen.getByLabelText('진행 중', { selector: 'select' }), { target: { value: 'top' } });
    fireEvent.change(screen.getByLabelText('마무리', { selector: 'select' }), { target: { value: 'bottom' } });
    fireEvent.click(screen.getByRole('button', { name: '임시 저장' }));
    await screen.findByText(/임시 저장했어요 · 12\. 20\. 14:32/);
    const body = lastBody('/api/campaigns');
    expect(body.settings.blockToolId).toBe('b1');
    expect(body.settings.slots).toMatchObject({ detail: 'after_common', before: 'none', running: 'top', final: 'bottom' });

    // edits after creation go to PUT on the same campaign
    fireEvent.change(screen.getByLabelText('진행 중', { selector: 'select' }), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: '임시 저장' }));
    await waitFor(() => expect(lastBody('/api/campaigns/c1')?.settings.slots.running).toBe('none'));
  });

  test('publish scheduled shows confirm with schedule', async () => {
    open();
    fireEvent.change(screen.getByLabelText('캠페인 이름'), { target: { value: '새해 1.5도 한달살기' } });
    fireEvent.change(screen.getByLabelText('모집 시작 날짜'), { target: { value: '2027-01-04' } });
    fireEvent.change(screen.getByLabelText('모집 시작 시각'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('모집 마감 날짜'), { target: { value: '2027-01-31' } });
    fireEvent.change(screen.getByLabelText('진행 시작 날짜'), { target: { value: '2027-02-08' } });
    fireEvent.change(screen.getByLabelText('진행 기간'), { target: { value: '28' } });
    fireEvent.click(within(group('공개 방식')).getByRole('button', { name: '예약 공개' }));
    expect(screen.getByText(/예약 공개: 모집 시작 시각\(2027\. 1\. 4\.\(월\) 10:00\)에/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '공개 예약하기' }));

    const dlg = await screen.findByRole('dialog', { name: '공개를 예약할까요?' });
    expect(within(dlg).getByText('2027. 1. 4.(월) 10:00')).toBeInTheDocument();
    expect(within(dlg).getByText('2. 8.(월)–3. 7.(일) · 28일')).toBeInTheDocument();
    expect(within(dlg).getByText('녹색전환연구소')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/campaigns/c1/publish')).toBe(false);
    fireEvent.click(within(dlg).getByRole('button', { name: '공개 예약하기' }));
    await screen.findByText('목록 화면');
    expect(lastBody('/api/campaigns/c1/publish')).toMatchObject({ mode: 'scheduled', showUpcoming: true, hero: false });
  });

  test('API field errors show next to the field', async () => {
    open();
    failNext = { field: 'schedule.recruitEnd', message: '모집 마감은 모집 시작 뒤여야 해요' };
    fireEvent.click(screen.getByRole('button', { name: '임시 저장' }));
    const errs = await screen.findAllByText('모집 마감은 모집 시작 뒤여야 해요');
    const inline = errs.find((e) => e.classList.contains('field-error'))!;
    expect(inline.closest('.ed-row')).toContainElement(screen.getByLabelText('모집 마감 날짜'));
    expect(screen.getByLabelText('모집 마감 날짜')).toHaveAttribute('aria-invalid', 'true');
  });
});
