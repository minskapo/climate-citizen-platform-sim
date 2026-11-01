import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { simStore, useSim } from '../../lib/sim';
import { showToast } from '../../components/Toast';

export interface Me {
  id: string; nickname: string; sido: string; sigungu: string;
  consents: { research?: boolean; [k: string]: unknown };
  settings: { reminderOn?: boolean; reminderTime?: string; newPostAlert?: boolean; [k: string]: unknown };
}

/** 내 계정 정보 + 바로 저장. consents · settings는 통째로 덮어쓰므로 기존 값에 합쳐 보낸다. */
export function useMe() {
  const sim = useSim();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (!sim.userId) { setMe(null); return; }
    let alive = true;
    api<Me>('/api/me', { quiet: true }).then((r) => alive && setMe(r)).catch(() => alive && setMe(null));
    return () => { alive = false; };
  }, [sim.userId]);
  const save = useCallback(async (patch: { nickname?: string; sido?: string; sigungu?: string; consents?: Partial<Me['consents']>; settings?: Partial<Me['settings']> }, quiet = false): Promise<Me> => {
    const cur = me!;
    const body = {
      ...patch,
      ...(patch.consents ? { consents: { ...cur.consents, ...patch.consents } } : {}),
      ...(patch.settings ? { settings: { ...cur.settings, ...patch.settings } } : {}),
    };
    const next = await api<Me>('/api/me', { method: 'PATCH', body, quiet: true });
    setMe(next);
    if (next.nickname !== sim.nickname) simStore.set({ nickname: next.nickname });
    if (!quiet) showToast('저장했어요');
    return next;
  }, [me, sim.nickname]);
  return { me, save };
}

export const reminderOn = (me: Me) => me.settings.reminderOn !== false;
export const reminderTime = (me: Me) => me.settings.reminderTime ?? '20:00';
