import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GroupDetail } from './GroupDetail';
import { GroupManage } from './GroupManage';
import { ToastHost } from '../../components/Toast';
import { __reloadSimForTest, simStore } from '../../lib/sim';

const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
let group: Record<string, unknown> = {};
const members = [
  { userId: 'u1', nickname: '초록걸음', region: '원주', role: 'owner', joinedOn: '2027-01-02' },
  { userId: 'u2', nickname: '원주자전거', region: '원주', role: 'staff', joinedOn: '2027-01-03' },
  { userId: 'u3', nickname: '바람개비', region: '원주', role: 'member', joinedOn: '2027-01-04' },
];
vi.mock('../../lib/api', () => ({
  ApiError: class extends Error {},
  api: vi.fn(async (path: string, init?: { body?: Record<string, unknown> }) => {
    calls.push({ path, body: init?.body });
    if (path === '/api/groups/g1') return group;
    if (path.startsWith('/api/groups/g1/members')) return { items: members };
    if (path.startsWith('/api/campaigns')) return { items: [{ id: 'c1', type: 'practice', title: '한달살기 2기', status: 'scheduled', schedule: { recruitStart: '2027-01-25', recruitEnd: '2027-02-10', runStart: '2027-02-15', runDays: 28 }, participantCount: 3, host: { id: 'g1' } }], nextCursor: null };
    if (path.startsWith('/api/boards/')) return { items: [], nextCursor: null };
    return { ok: true };
  }),
}));

const open = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/groups/:id" element={<GroupDetail />} />
      <Route path="/groups/:id/manage" element={<GroupManage />} />
      <Route path="/login" element={<p>로그인 화면</p>} />
    </Routes>
    <ToastHost />
  </MemoryRouter>,
);
const full = { id: 'g1', name: '원주 모임', sido: '강원', sigungu: '원주', joinPolicy: 'open', closed: false, description: '소개', categories: ['공지', '자유'], memberCount: 3, newPostsThisWeek: 1, chatLink: 'https://open.kakao.com/x' };

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  __reloadSimForTest();
  simStore.set({ userId: 'u3', nickname: '바람개비', role: 'member' });
});

describe('groups', () => {
  test('「개설」 date shows the creator\'s sim date, not the real creation time', async () => {
    group = { ...full, myRole: 'member', createdAt: '2026-11-02T01:00:00.000Z', simDate: '2027-04-01' };
    open('/groups/g1');
    expect(await screen.findByText(/4\. 1\.\(목\) 개설/)).toBeInTheDocument();
  });

  test('private group visible by name only; invite link joins', async () => {
    group = { id: 'g1', name: '비공개 모임', sido: '강원', sigungu: '', joinPolicy: 'private', myRole: null, closed: false };
    open('/groups/g1?invite=abc123');
    expect(await screen.findByRole('heading', { name: '비공개 모임' })).toBeInTheDocument();
    expect(screen.getByText('비공개 모임이에요')).toBeInTheDocument();
    expect(screen.queryByText('소개')).toBeNull();
    expect(screen.queryByRole('button', { name: '모임 가입하기' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '초대받아 가입하기' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/api/groups/g1/join')?.body).toEqual({ invite: 'abc123' }));
  });

  test('staff manage page hidden from members', async () => {
    group = { ...full, myRole: 'member' };
    const { unmount } = open('/groups/g1/manage');
    expect(await screen.findByText('운영진만 볼 수 있어요')).toBeInTheDocument();
    expect(screen.queryByText('초대 링크 복사')).toBeNull();
    expect(calls.some((c) => c.path.startsWith('/api/groups/g1/members'))).toBe(false);
    unmount();
    group = { ...full, myRole: 'staff' };
    open('/groups/g1/manage');
    expect(await screen.findByRole('button', { name: '초대 링크 복사' })).toBeInTheDocument();
    // 운영진은 운영진 지정 · 모임장 넘기기 · 모임 닫기를 할 수 없다(모임장만)
    expect(screen.queryByRole('button', { name: '운영진 지정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '모임 닫기' })).toBeNull();
  });

  test('member detail has no 모임 관리 button, staff has', async () => {
    group = { ...full, myRole: 'member' };
    const { unmount } = open('/groups/g1');
    await screen.findByRole('heading', { name: '원주 모임' });
    expect(screen.queryByText(/모임 관리/)).toBeNull();
    unmount();
    group = { ...full, myRole: 'staff' };
    open('/groups/g1');
    expect(await screen.findByText('⚙ 모임 관리')).toBeInTheDocument();
    expect(await screen.findByText('운영진에게만 보여요')).toBeInTheDocument();
  });

  test('transfer requires acceptance within 7 days', async () => {
    simStore.set({ userId: 'u1', nickname: '초록걸음' });
    group = { ...full, myRole: 'owner' };
    open('/groups/g1/manage');
    fireEvent.click(await screen.findByRole('button', { name: '모임장 넘기기' }));
    expect(screen.getByText('상대가 수락하면 넘어가요. 7일 안에 수락하지 않으면 취소돼요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '수락 요청 보내기' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/api/groups/g1/transfer')?.body).toEqual({ toUserId: 'u2' }));
    expect(await screen.findByText('원주자전거 님에게 모임장 수락을 요청했어요')).toBeInTheDocument();
  });

  test('transfer target accepts from group page', async () => {
    simStore.set({ userId: 'u2', nickname: '원주자전거' });
    group = { ...full, myRole: 'staff', pendingTransferTo: 'u2', pendingTransferExpires: '2027-01-12T00:00:00.000Z' };
    open('/groups/g1');
    fireEvent.click(await screen.findByRole('button', { name: '수락하기' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/groups/g1/transfer/accept')).toBe(true));
  });

  test('close requires exact group name', async () => {
    simStore.set({ userId: 'u1', nickname: '초록걸음' });
    group = { ...full, myRole: 'owner' };
    open('/groups/g1/manage');
    fireEvent.click(await screen.findByRole('button', { name: '모임 닫기' }));
    const confirm = screen.getAllByRole('button', { name: '모임 닫기' }).at(-1)!;
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('원주 모임'), { target: { value: '원주 모' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('원주 모임'), { target: { value: '원주 모임' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(calls.find((c) => c.path === '/api/groups/g1/close')?.body).toEqual({ confirmName: '원주 모임' }));
  });
});
