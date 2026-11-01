import { useSyncExternalStore, useEffect, useState } from 'react';
import type { HHMM, ISODate, Role } from '@shared/types';
import { addDays, todayReal } from '@shared/date';

/** 브라우저별 체험 상태. 역할 · 활동명 · 내 날짜는 이 브라우저에만 적용된다. */
export interface SimState {
  token: string | null;
  userId: string | null;
  nickname: string | null;
  role: Role;
  staffGroupId: string | null;
  dateOffsetDays: number;
  fixedDate: ISODate | null;
  timeOverride: HHMM | null;
  pendingMeasurementIds: string[];
}

export const SIM_KEY = 'sim.v1';
const ROLES: readonly Role[] = ['guest', 'member', 'staff', 'admin'];

const DEFAULTS: SimState = {
  token: null,
  userId: null,
  nickname: null,
  role: 'guest',
  staffGroupId: null,
  dateOffsetDays: 0,
  fixedDate: null,
  timeOverride: null,
  pendingMeasurementIds: [],
};

const isDate = (v: unknown): v is ISODate => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown): v is HHMM => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);

function sanitize(raw: unknown): SimState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
  const r = raw as Record<string, unknown>;
  return {
    token: strOrNull(r.token),
    userId: strOrNull(r.userId),
    nickname: strOrNull(r.nickname),
    role: ROLES.includes(r.role as Role) ? (r.role as Role) : 'guest',
    staffGroupId: strOrNull(r.staffGroupId),
    dateOffsetDays: Number.isInteger(r.dateOffsetDays) ? (r.dateOffsetDays as number) : 0,
    fixedDate: isDate(r.fixedDate) ? r.fixedDate : null,
    timeOverride: isTime(r.timeOverride) ? r.timeOverride : null,
    pendingMeasurementIds: Array.isArray(r.pendingMeasurementIds)
      ? r.pendingMeasurementIds.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

function load(): SimState {
  try {
    const s = localStorage.getItem(SIM_KEY);
    return s ? sanitize(JSON.parse(s)) : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

let state: SimState = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** 컴포넌트 밖(api 등)에서도 쓰는 저장소. */
export const simStore = {
  get: (): SimState => state,
  set(patch: Partial<SimState>) {
    state = { ...state, ...patch };
    try {
      localStorage.setItem(SIM_KEY, JSON.stringify(state));
    } catch {
      /* 저장이 막혀도 이번 화면에서는 계속 쓴다 */
    }
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

if (typeof window !== 'undefined') {
  // 같은 브라우저의 다른 탭과 맞춘다.
  window.addEventListener('storage', (e) => {
    if (e.key !== SIM_KEY) return;
    state = load();
    emit();
  });
}

export function __reloadSimForTest() {
  state = load();
  emit();
}

/** Asia/Seoul 기준 지금 시각 HH:mm */
export function realTime(): HHMM {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
}

export function simToday(s: SimState = state): ISODate {
  return addDays(s.fixedDate ?? todayReal(), s.dateOffsetDays);
}

export function simNowTime(s: SimState = state): HHMM {
  return s.timeOverride ?? realTime();
}

const actions = {
  setRole(r: Role) {
    simStore.set({ role: r, staffGroupId: r === 'staff' ? state.staffGroupId : null });
  },
  /** 날짜를 고른다. null이면 「오늘로」. */
  setDate(d: ISODate | null) {
    simStore.set({ fixedDate: d, dateOffsetDays: 0 });
  },
  shiftDays(n: number) {
    simStore.set({ dateOffsetDays: state.dateOffsetDays + n });
  },
  setTime(t: HHMM | null) {
    simStore.set({ timeOverride: t });
  },
  setToken(t: string | null) {
    simStore.set({ token: t });
  },
  setUser(userId: string, nickname: string) {
    simStore.set({ userId, nickname, staffGroupId: state.userId === userId ? state.staffGroupId : null });
  },
  setStaffGroup(groupId: string) {
    simStore.set({ role: 'staff', staffGroupId: groupId });
  },
  setPendingMeasurementIds(ids: string[]) {
    simStore.set({ pendingMeasurementIds: ids });
  },
  /** 로그아웃: 비회원으로 돌아간다. 입장 토큰과 내 날짜는 그대로 둔다. */
  signOut() {
    simStore.set({ userId: null, nickname: null, role: 'guest', staffGroupId: null });
  },
};

export type Sim = SimState & typeof actions & { today: ISODate; nowTime: HHMM; realToday: ISODate };

/** 실제 시계가 분 단위로 넘어갈 때 다시 그리게 한다(시각을 고정하지 않았을 때). */
function useMinuteTick(enabled: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setN((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [enabled]);
}

export function useSim(): Sim {
  const s = useSyncExternalStore(simStore.subscribe, simStore.get, simStore.get);
  useMinuteTick(s.timeOverride === null || s.fixedDate === null);
  return { ...s, ...actions, today: simToday(s), nowTime: simNowTime(s), realToday: todayReal() };
}
