import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import { useSim } from './sim';

let unread = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setUnread(n: number) {
  unread = n;
  listeners.forEach((l) => l());
}

export const SYNC_MS = 60_000;

/** 날짜 알림을 만들고 안 읽은 수를 받아 온다. 알림함 화면에서 읽음 처리 후에도 부른다. */
export async function syncNotifications(): Promise<void> {
  try {
    const r = await api<{ unread: number }>('/api/notifications/sync', { method: 'POST', body: {}, quiet: true });
    setUnread(r.unread);
  } catch {
    /* 알림 수는 다음 확인 때 다시 시도 */
  }
}

/** 헤더의 「알림 n」. 회원일 때 창이 보이는 동안에만 60초마다, 그리고 창이 다시 보일 때 확인한다. */
export function useUnreadNotifications(): number {
  const { userId, role, token, today, timeOverride } = useSim();
  const active = !!token && !!userId && role !== 'guest';
  useEffect(() => {
    if (!active) {
      setUnread(0);
      return;
    }
    const tick = () => {
      if (document.visibilityState === 'visible') void syncNotifications();
    };
    tick();
    const id = setInterval(tick, SYNC_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active, userId, role, today, timeOverride]);
  return useSyncExternalStore(subscribe, () => unread, () => unread);
}
