import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SignupPage } from '../auth/SignupPage';
import { K5Campaigns } from './K5Campaigns';
import { ToastHost } from '../../components/Toast';
import { __reloadSimForTest, simStore } from '../../lib/sim';

const calls: Array<{ path: string; body?: unknown }> = [];
let campaigns: unknown[] = [];
class CodeError extends Error { constructor(public code: string, m: string) { super(m); } }
vi.mock('../../lib/api', () => ({
  ApiError: class extends Error {},
  api: vi.fn(async (path: string, init?: { body?: unknown }) => {
    calls.push({ path, body: init?.body });
    if (path === '/api/users') {
      if ((init!.body as { nickname: string }).nickname === '중복') throw new CodeError('NICKNAME_TAKEN', '이미 쓰고 있는 활동명이에요');
      return { id: 'u9', nickname: (init!.body as { nickname: string }).nickname };
    }
    if (path === '/api/measurements/claim') return { claimed: 1 };
    if (path.startsWith('/api/campaigns?status=recruiting')) return { items: campaigns };
    if (path.startsWith('/api/campaigns?')) return { items: [] };
    if (path === '/api/campaigns/s1') {
      return { campaign: { id: 's1', type: 'signature', title: '기후예산 서명', host: { type: 'igt', name: '녹색전환연구소' }, hostGroupId: null, schedule: {}, settings: { fields: ['nickname', 'region'], demandSummary: '예산을 늘려 주세요', hostJoin: 'none' } }, counts: { seatsLeft: null, waitlisted: 0 }, myParticipation: null };
    }
    if (path === '/api/campaigns/o1') {
      return { campaign: { id: 'o1', type: 'offline', title: '탐방', host: { type: 'group', id: 'g1', name: '마포 모임' }, hostGroupId: 'g1', schedule: { eventDate: '2027-01-25' }, settings: { askCompanions: true, askTransport: true, waitlist: true } }, counts: { seatsLeft: 0, waitlisted: 1 }, myParticipation: null };
    }
    if (path === '/api/campaigns/s1/participate') return { participation: { id: 'p1', signatureNo: 1047 }, waitlisted: false };
    if (path === '/api/campaigns/o1/participate') return { participation: { id: 'p2', waitlistNo: 2 }, waitlisted: true };
    if (path === '/api/me') return { nickname: '초록이', sido: '강원', sigungu: '원주시' };
    return { items: [] };
  }),
}));

function Where() { const l = useLocation(); return <p data-testid="loc">{l.pathname + l.search}</p>; }

beforeEach(() => {
  calls.length = 0;
  campaigns = [];
  localStorage.clear();
  __reloadSimForTest();
});

describe('signup', () => {
  const fill = (nick: string) => {
    fireEvent.change(screen.getByLabelText('활동명'), { target: { value: nick } });
    fireEvent.click(screen.getByLabelText(/\[필수\] 이용약관/));
    fireEvent.click(screen.getByLabelText(/\[필수\] 개인정보/));
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
  };
  const renderSignup = () => render(<MemoryRouter initialEntries={['/signup']}><Routes><Route path="/signup" element={<SignupPage />} /><Route path="/onboarding/region" element={<Where />} /></Routes></MemoryRouter>);

  test('signup with taken nickname shows 이미 쓰는 활동명이에요', async () => {
    renderSignup();
    fill('중복');
    expect(await screen.findByText('이미 쓰는 활동명이에요')).toBeInTheDocument();
  });

  test('signup claims pending measurements and goes to onboarding', async () => {
    simStore.set({ pendingMeasurementIds: ['l1'] });
    renderSignup();
    fill('햇빛부자');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/onboarding/region'));
    expect(calls.find((c) => c.path === '/api/measurements/claim')?.body).toEqual({ localIds: ['l1'] });
    expect(simStore.get().pendingMeasurementIds).toEqual([]);
    expect(simStore.get().userId).toBe('u9');
  });
});

describe('K-5', () => {
  const item = { id: 's1', type: 'signature', title: '기후예산 서명', host: { type: 'igt', name: '녹색전환연구소' }, schedule: {}, status: 'recruiting' };
  const renderK5 = () => {
    simStore.set({ userId: 'u1', nickname: '초록이', role: 'member' });
    return render(<MemoryRouter initialEntries={['/onboarding/campaigns']}><K5Campaigns sido="강원" sigungu="" modes={['signature']} applied={[]} onApplied={() => undefined} onPrev={() => undefined} onNext={() => undefined} onSkip={() => undefined} /><Where /><ToastHost /></MemoryRouter>);
  };

  test('K-5 sign keeps user on K-5 and shows toast', async () => {
    campaigns = [item];
    renderK5();
    fireEvent.click(await screen.findByRole('button', { name: '서명하기' }));
    await screen.findByText('설명 글 보기 →');
    fireEvent.click(screen.getAllByRole('button', { name: '서명하기' }).at(-1)!);
    await waitFor(() => expect(screen.queryByText('설명 글 보기 →')).not.toBeInTheDocument());
    expect(screen.getByTestId('loc')).toHaveTextContent('/onboarding/campaigns');
    expect(await screen.findByText('서명했어요 · 1,047번째 서명이에요')).toBeInTheDocument();
  });

  test('K-5 shows empty message when no open campaigns', async () => {
    renderK5();
    expect(await screen.findByText('아직 열린 캠페인이 없어요')).toBeInTheDocument();
  });
});
