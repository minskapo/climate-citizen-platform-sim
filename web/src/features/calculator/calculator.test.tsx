import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { calculate, POLICIES_REDUCE, POLICIES_SOCIAL, QUESTIONS } from '@shared/calculator';
import { CalculatorPage } from './CalculatorPage';
import { HomeCalcCard } from './HomeCalcCard';
import { __reloadSimForTest, simStore } from '../../lib/sim';

const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
vi.mock('../../lib/api', () => ({
  ApiError: class extends Error {},
  api: vi.fn(async (path: string, init?: { body?: Record<string, unknown> }) => {
    calls.push({ path, body: init?.body });
    if (path === '/api/measurements') {
      const { ans: _a, ...result } = calculate(init!.body!.answers as never);
      return { measurement: { id: 'm1', result, policies: [] } };
    }
    if (path.endsWith('/choices')) return { measurement: { id: 'm1' } };
    if (path === '/api/aggregates/calculator') return { count: 5, avg: 10, policyCounts: { [POLICIES_REDUCE[0]]: 7 } };
    if (path.startsWith('/api/campaigns?status=recruiting')) return { items: [{ id: 'r1', title: '새해 1.5도 한달살기', summary: '이동이 많은 분께', participantCount: 312 }, { id: 'r2', title: '동네 걷기', summary: '', participantCount: 5 }] };
    if (path.startsWith('/api/campaigns?')) return { items: [] };
    if (path === '/api/campaigns/c1') return { campaign: { title: '새해 한달살기' }, myParticipation: null };
    return {};
  }),
}));

function Where() {
  const l = useLocation();
  return <p data-testid="loc">{l.pathname + l.search}</p>;
}

const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><CalculatorPage /></MemoryRouter>);

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));

/** 결과 화면이 나올 때까지 문항을 넘긴다. setters: 문항 안내문 → 값 */
async function toResult(numbers: Record<string, string> = {}) {
  for (let i = 0; i < 80 && !screen.queryByText('나의 1년 탄소배출량'); i++) {
    const start = screen.queryByRole('button', { name: '시작하기' });
    if (start) { fireEvent.click(start); continue; }
    for (const [label, v] of Object.entries(numbers)) {
      const input = screen.queryByLabelText(label);
      if (input) fireEvent.change(input, { target: { value: v } });
    }
    const next = screen.getByRole('button', { name: /^(다음|결과 보기)$/ });
    if ((next as HTMLButtonElement).disabled) fireEvent.click(screen.getAllByRole('radio')[0]);
    const last = screen.queryByRole('button', { name: '결과 보기' });
    fireEvent.click(screen.getByRole('button', { name: /^(다음|결과 보기)$/ }));
    if (last) break;
  }
  await screen.findByText('나의 1년 탄소배출량');
}

const CAR = '일주일에 내연기관 승용차를 타는 시간은?';

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ role: 'member', userId: 'u1', nickname: '초록이' });
});

describe('calculator', () => {
  test('q1 from home card is prefilled and starts at question 2', () => {
    renderAt('/calculator?from=home&q1=3');
    expect(screen.getByText(QUESTIONS.food[1].t)).toBeInTheDocument();
    expect(screen.getByText(/1번 답 「3회」/)).toBeInTheDocument();
    expect(screen.getByText(/먹거리 · 2 \/ 28/)).toBeInTheDocument();
  });

  test('home card passes q1 to the calculator', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomeCalcCard />} />
          <Route path="/calculator" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(QUESTIONS.food[0].t), { target: { value: '4' } });
    click('다음');
    expect(screen.getByTestId('loc')).toHaveTextContent('/calculator?from=home&q1=4');
  });

  test('over 5.9 shows actions then reduce policies; max 3 actions', async () => {
    renderAt('/calculator');
    await toResult({ [CAR]: '60' });
    click(/감축 행동 고르기/);
    const boxes = await screen.findAllByRole('checkbox');
    boxes.slice(0, 4).forEach((b) => fireEvent.click(b));
    expect(screen.getAllByRole('checkbox').filter((b) => b.getAttribute('aria-checked') === 'true')).toHaveLength(3);
    expect(screen.getAllByRole('checkbox')[3]).toBeDisabled();
    click('다음');
    await screen.findByText(POLICIES_REDUCE[0]);
    expect(calls.some((c) => c.path === '/api/measurements/m1/choices' && (c.body?.actions as string[]).length === 3)).toBe(true);
    fireEvent.click(screen.getByText(POLICIES_REDUCE[0]));
    fireEvent.click(screen.getByText(POLICIES_REDUCE[1]));
    click('완료');
    await screen.findByText(/같은 정책을 고른 시민 7명/);
  });

  test('under 5.9 shows social foundation then social policies', async () => {
    renderAt('/calculator');
    await toResult();
    click(/사회적 기초/);
    await screen.findByText(/불편한 점/);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    click('다음');
    await screen.findByText(POLICIES_SOCIAL[0]);
    expect(calls.some((c) => Array.isArray(c.body?.social))).toBe(true);
  });

  test('guest result stored locally and claimed after signup', async () => {
    simStore.set({ role: 'guest', userId: null });
    renderAt('/calculator');
    await toResult();
    const post = calls.find((c) => c.path === '/api/measurements')!;
    const localId = post.body!.localId as string;
    expect(localId).toBeTruthy();
    expect(simStore.get().pendingMeasurementIds).toEqual([localId]);
    expect(screen.getByText('결과가 아직 저장되지 않았어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /카카오로 3초/ })).toBeInTheDocument();
  });

  test('campaign flow saves kind=end and shows back link', async () => {
    renderAt('/calculator?from=campaign&campaignId=c1&kind=end&back=/campaigns/c1');
    expect(await screen.findByRole('button', { name: '← 새해 한달살기로 돌아가기' })).toBeInTheDocument();
    expect(screen.getByText('마무리 측정 중')).toBeInTheDocument();
    await toResult();
    const post = calls.find((c) => c.path === '/api/measurements')!;
    expect(post.body).toMatchObject({ place: 'campaign', campaignId: 'c1', kind: 'end' });
    await waitFor(() => expect(screen.getByText(/마무리 측정 저장됨/)).toBeInTheDocument());
  });

  test('multi and count answers are saved as string[] and Record<string, number>', async () => {
    renderAt('/calculator');
    for (let i = 0; i < 80 && !screen.queryByText('나의 1년 탄소배출량'); i++) {
      const start = screen.queryByRole('button', { name: '시작하기' });
      if (start) { fireEvent.click(start); continue; }
      const mt = screen.queryByRole('checkbox', { name: /TV로/ });
      if (mt) fireEvent.click(mt);
      const fridge = screen.queryByLabelText('냉장고');
      if (fridge) fireEvent.change(fridge, { target: { value: '2' } });
      const next = screen.getByRole('button', { name: /^(다음|결과 보기)$/ });
      if ((next as HTMLButtonElement).disabled) fireEvent.click(screen.getAllByRole('radio')[0]);
      const last = screen.queryByRole('button', { name: '결과 보기' });
      fireEvent.click(screen.getByRole('button', { name: /^(다음|결과 보기)$/ }));
      if (last) break;
    }
    await screen.findByText('나의 1년 탄소배출량');
    const a = calls.find((c) => c.path === '/api/measurements')!.body!.answers as Record<string, unknown>;
    expect(a.leisureWays).toEqual(['tv']);
    expect(a.appliances).toEqual({ fridge: 2 });
  });

  test('exactly 5.9 goes to the social branch', async () => {
    const { calculate: real } = await import('@shared/calculator');
    expect(real({}).under).toBe(true);
    const { api } = await import('../../lib/api');
    (api as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async (path: string, init?: { body?: unknown }) => {
      calls.push({ path, body: init?.body as never });
      return { measurement: { id: 'm1', result: { ...real({}), total: 5.9, sectors: { food: 5.9, consumption: 0, transport: 0, housing: 0, leisure: 0 }, under: true }, policies: [] } };
    });
    renderAt('/calculator');
    await toResult();
    expect(screen.getByRole('button', { name: /사회적 기초/ })).toBeInTheDocument();
  });

  test('result shows recommended campaign preferring the top sector, and guest policy teaser', async () => {
    simStore.set({ role: 'guest', userId: null });
    renderAt('/calculator');
    await toResult({ [CAR]: '60' });
    expect(await screen.findByText('새해 1.5도 한달살기')).toBeInTheDocument();
    expect(screen.getByText(/이동이\(가\) 가장 많은 분께 추천/)).toBeInTheDocument();
    expect(screen.getByText('같은 정책을 고른 시민 수는 가입하면 볼 수 있어요')).toBeInTheDocument();
  });

  test('guest sees the save-later line on question screens', () => {
    simStore.set({ role: 'guest', userId: null });
    renderAt('/calculator');
    expect(screen.getByText('가입 없이 · 결과는 가입 후 저장')).toBeInTheDocument();
  });
});
