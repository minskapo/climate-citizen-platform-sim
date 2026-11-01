import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SimBar } from './SimBar';
import { __reloadSimForTest, simStore } from '../lib/sim';

vi.mock('../lib/api', () => ({ api: vi.fn(async () => []), ApiError: class extends Error {} }));

function renderBar() {
  return render(
    <MemoryRouter>
      <SimBar />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ token: 't', userId: 'u1', nickname: '초록이' });
});

describe('SimBar', () => {
  test('SimBar hides reset unless admin', () => {
    simStore.set({ role: 'member' });
    renderBar();
    expect(screen.queryByRole('button', { name: '초기화' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '체험 데이터 내보내기' })).not.toBeInTheDocument();
    act(() => simStore.set({ role: 'admin' }));
    expect(screen.getByRole('button', { name: '초기화' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '체험 데이터 내보내기' })).toBeInTheDocument();
  });

  test('shows role, nickname and my date', () => {
    simStore.set({ role: 'member', fixedDate: '2027-02-08', dateOffsetDays: 0 });
    renderBar();
    expect(screen.getByLabelText('지금 역할')).toHaveValue('member');
    expect(screen.getByText('초록이')).toBeInTheDocument();
    expect(screen.getByLabelText('내 날짜')).toHaveValue('2027-02-08');
  });

  test('+7 moves my date', () => {
    simStore.set({ role: 'member', fixedDate: '2027-02-08', dateOffsetDays: 0 });
    renderBar();
    act(() => screen.getByRole('button', { name: '+7' }).click());
    expect(screen.getByLabelText('내 날짜')).toHaveValue('2027-02-15');
    act(() => screen.getByRole('button', { name: '−1' }).click());
    expect(screen.getByLabelText('내 날짜')).toHaveValue('2027-02-14');
  });
});

describe('SimBar role switching', () => {
  test('choosing 관리자 goes to /admin and leaving goes back to /', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const { Routes, Route, useLocation } = await import('react-router-dom');
    function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }
    simStore.set({ role: 'member' });
    render(
      <MemoryRouter initialEntries={['/campaigns']}>
        <SimBar />
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('지금 역할'), { target: { value: 'admin' } });
    expect(screen.getByTestId('where')).toHaveTextContent('/admin');
    expect(simStore.get().role).toBe('admin');
    fireEvent.change(screen.getByLabelText('지금 역할'), { target: { value: 'guest' } });
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
    expect(simStore.get().role).toBe('guest');
  });

  test('choosing 모임 운영진 asks which group before switching', async () => {
    const { fireEvent, findByText } = await import('@testing-library/react').then((m) => ({ ...m, findByText: m.screen.findByText }));
    const { api } = await import('../lib/api');
    vi.mocked(api).mockResolvedValueOnce({
      items: [
        { id: 'g1', name: '원주 1.5도 모임', sido: '강원', sigungu: '원주시', myRole: 'member', closed: false },
        { id: 'g2', name: '남의 모임', sido: '서울', sigungu: '', myRole: null, closed: false },
      ],
      nextCursor: null,
    });
    simStore.set({ role: 'member' });
    renderBar();
    fireEvent.change(screen.getByLabelText('지금 역할'), { target: { value: 'staff' } });
    expect(simStore.get().role).toBe('member');
    fireEvent.click(await findByText('원주 1.5도 모임'));
    expect(screen.queryByText('남의 모임')).not.toBeInTheDocument();
    expect(simStore.get().role).toBe('staff');
    expect(simStore.get().staffGroupId).toBe('g1');
  });
});
