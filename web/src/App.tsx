import { useEffect } from 'react';
import { EnterGate } from './features/auth/EnterGate';
import { ToastHost } from './components/Toast';
import { api, ApiError } from './lib/api';
import { simStore, useSim } from './lib/sim';
import { AppRoutes } from './routes';

/** 저장된 활동명이 아직 있는지 확인한다(체험 데이터 초기화 뒤에는 사라질 수 있음). */
function useVerifyUser(token: string | null, userId: string | null) {
  useEffect(() => {
    if (!token || !userId) return;
    let alive = true;
    api<{ id: string; nickname: string }>('/api/me', { quiet: true, asUser: true })
      .then((me) => {
        if (alive && simStore.get().userId === me.id && simStore.get().nickname !== me.nickname) simStore.set({ nickname: me.nickname });
      })
      .catch((e) => {
        if (alive && e instanceof ApiError && e.code === 'USER_NOT_FOUND' && simStore.get().userId === userId) {
          simStore.set({ userId: null, nickname: null, role: 'guest', staffGroupId: null });
        }
      });
    return () => { alive = false; };
  }, [token, userId]);
}

export function App() {
  const { token, userId } = useSim();
  useVerifyUser(token, userId);
  return (
    <>
      {token ? <AppRoutes /> : <EnterGate />}
      <ToastHost />
    </>
  );
}
