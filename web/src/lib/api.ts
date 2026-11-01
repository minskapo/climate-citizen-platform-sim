import { showToast } from '../components/Toast';
import { simNowTime, simStore, simToday } from './sim';

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || 'https://climate-sim.minskapo.workers.dev';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const DAILY_CAP_TEXT = '오늘 체험 한도에 가까워 잠시 멈췄어요';
const NETWORK_TEXT = '연결이 잠시 끊겼어요. 다시 시도해 주세요';

export interface ApiInit {
  method?: string;
  body?: unknown;
  /** 관리자 미리보기(X-Preview: 1) */
  preview?: boolean;
  /** true면 오류 토스트를 띄우지 않는다(화면에서 직접 처리). 401 입장 만료는 그래도 처리한다. */
  quiet?: boolean;
  signal?: AbortSignal;
  /** 비회원 역할이어도 저장된 활동명으로 보낸다(활동명 확인 등). */
  asUser?: boolean;
}

/** 지금 체험 상태로 만든 요청 헤더. */
export function simHeaders(asUser = false): Record<string, string> {
  const s = simStore.get();
  const role = asUser && s.role === 'guest' && s.userId ? 'member' : s.role;
  const h: Record<string, string> = {
    'X-Role': role,
    'X-Sim-Date': simToday(s),
    'X-Sim-Time': simNowTime(s),
  };
  if (s.token) h['X-Sim-Token'] = s.token;
  // 비회원 역할은 로그인하지 않은 상태로 보기: 사용자 ID를 보내지 않는다.
  if (s.userId && role !== 'guest') h['X-User-Id'] = s.userId;
  if (role === 'staff' && s.staffGroupId) h['X-Staff-Group'] = s.staffGroupId;
  return h;
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const b = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(res.status, b.error?.code ?? `HTTP_${res.status}`, b.error?.message ?? '요청을 처리하지 못했어요');
  } catch {
    return new ApiError(res.status, `HTTP_${res.status}`, '요청을 처리하지 못했어요');
  }
}

/** Worker API 호출. 헤더는 자동으로 붙는다.
 *  - 401 NO_TOKEN/BAD_TOKEN: 입장 토큰을 지워 입장 화면으로 돌아간다.
 *  - 503 DAILY_CAP: 「오늘 체험 한도에 가까워 잠시 멈췄어요」 토스트.
 *  - 403 RESTRICTED: 토스트. */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = simHeaders(init.asUser);
  if (init.preview) headers['X-Preview'] = '1';
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    if (!init.quiet) showToast(NETWORK_TEXT);
    throw new ApiError(0, 'NETWORK', NETWORK_TEXT);
  }
  if (!res.ok) {
    const err = await readError(res);
    if (res.status === 401 && (err.code === 'NO_TOKEN' || err.code === 'BAD_TOKEN')) {
      simStore.set({ token: null });
    } else if (res.status === 503 && err.code === 'DAILY_CAP') {
      showToast(DAILY_CAP_TEXT);
    } else if (res.status === 403 && err.code === 'RESTRICTED') {
      showToast(err.message);
    } else if (!init.quiet && res.status >= 500) {
      showToast(err.message);
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** 입장 암호 확인. 맞으면 토큰을 저장한다. */
export async function enter(passcode: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(API_BASE + '/api/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', NETWORK_TEXT);
  }
  if (!res.ok) {
    const err = await readError(res);
    if (err.code === 'TOO_MANY_ATTEMPTS') throw new ApiError(429, err.code, '잠시 후 다시 시도해 주세요');
    if (err.code === 'BAD_PASSCODE') throw new ApiError(401, err.code, '입장 암호가 맞지 않아요');
    throw err;
  }
  const { token } = (await res.json()) as { token: string };
  simStore.set({ token });
}

/** JSON 등을 파일로 내려받게 한다. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
