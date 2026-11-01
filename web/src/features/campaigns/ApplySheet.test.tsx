import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ApplySheet } from './ApplySheet';
import { ToastHost } from '../../components/Toast';
import { __reloadSimForTest, simStore } from '../../lib/sim';

const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
let seatsLeft: number | null = 0;
vi.mock('../../lib/api', () => ({
  ApiError: class extends Error {},
  api: vi.fn(async (path: string, init?: { body?: Record<string, unknown> }) => {
    calls.push({ path, body: init?.body });
    if (path === '/api/campaigns/p1') {
      return { campaign: { id: 'p1', type: 'practice', title: '한달살기', host: { type: 'group', id: 'g1', name: '실천방' }, hostGroupId: 'g1', schedule: { runStart: '2027-02-08', runDays: 28 }, settings: { startPoint: { enabled: true, toolId: 'calculator' }, reminderTime: '20:00' } }, counts: { seatsLeft: null, waitlisted: 0 }, myParticipation: null };
    }
    if (path === '/api/campaigns/o1') {
      return { campaign: { id: 'o1', type: 'offline', title: '탐방', host: { type: 'group', id: 'g1', name: '마포 모임' }, hostGroupId: 'g1', schedule: { eventDate: '2027-01-25' }, settings: { askCompanions: true, askTransport: true, waitlist: true } }, counts: { seatsLeft, waitlisted: 0 }, myParticipation: null };
    }
    if (path.endsWith('/participate')) return { participation: { id: 'pp', waitlistNo: 2 }, waitlisted: seatsLeft === 0 };
    if (path === '/api/me/measurements') return { items: [{ id: 'm1', simDate: '2027-01-10', result: { total: 11.2 } }] };
    if (path === '/api/me') return { nickname: '초록이', sido: '강원', sigungu: '원주시' };
    return {};
  }),
}));

function Where() { const l = useLocation(); return <p data-testid="loc">{l.pathname + l.search}</p>; }
const open = (id: string, origin: 'detail' | 'elsewhere') => render(
  <MemoryRouter initialEntries={['/campaigns/' + id]}><Routes><Route path="*" element={<><ApplySheet campaignId={id} origin={origin} onDone={() => undefined} onClose={() => undefined} /><Where /><ToastHost /></>} /></Routes></MemoryRouter>);

beforeEach(() => {
  calls.length = 0;
  seatsLeft = 0;
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ userId: 'u1', nickname: '초록이', role: 'member' });
});

describe('ApplySheet', () => {
  test('ApplySheet from detail navigates to completion route', async () => {
    open('p1', 'detail');
    await screen.findByText('저장된 계산 결과 쓰기');
    fireEvent.click(screen.getByRole('button', { name: '참여 신청 완료하기' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/campaigns/p1'));
    const body = calls.find((c) => c.path.endsWith('/participate'))!.body!;
    expect(body.startMeasurementId).toBe('m1');
    expect(body.consents).toMatchObject({ host: true });
  });

  test('practice 「신청 후 다시 재기」 goes to calculator from detail', async () => {
    open('p1', 'detail');
    fireEvent.click(await screen.findByLabelText('신청 후 다시 재기'));
    fireEvent.click(screen.getByRole('button', { name: '참여 신청 완료하기' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/calculator?from=campaign&campaignId=p1&kind=start'));
  });

  test('offline ApplySheet shows waitlist when full', async () => {
    open('o1', 'elsewhere');
    const btn = await screen.findByRole('button', { name: '대기 신청하기' });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText('대기 2번으로 신청했어요')).toBeInTheDocument());
  });
});
