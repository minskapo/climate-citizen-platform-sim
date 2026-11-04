import type { HHMM, ISODate, Role } from '@shared/types';
import { SIM_BASE_DATE } from '@shared/date';
import { fail, type Ctx, type Db } from './db';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ROLES: readonly Role[] = ['guest', 'member', 'staff', 'admin'];

const enc = new TextEncoder();

export async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** MAC input binds the token to the current passcode so rotating SIM_PASSCODE logs everyone out. */
async function tokenMac(secret: string, issuedAt: string, passcode: string): Promise<string> {
  return hmacHex(secret, `${issuedAt}.${await sha256Hex(passcode)}`);
}

export async function issueToken(secret: string, nowMs: number, passcode: string): Promise<string> {
  const issuedAt = String(Math.floor(nowMs));
  return `${issuedAt}.${await tokenMac(secret, issuedAt, passcode)}`;
}

export async function verifyToken(secret: string, token: string, nowMs: number, passcode: string): Promise<boolean> {
  const m = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return false;
  const issuedAt = Number(m[1]);
  if (nowMs - issuedAt > THIRTY_DAYS_MS || issuedAt - nowMs > 60_000) return false;
  return safeEqual(await tokenMac(secret, m[1], passcode), m[2]);
}

export function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function seoulTime(): HHMM {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  return p;
}

/** Builds the request context from headers; returns a Response on invalid headers. */
export function buildCtx(req: Request, db: Db, secret = ''): Ctx | Response {
  const h = req.headers;

  const rawRole = h.get('X-Role');
  const role = (rawRole ?? 'guest') as Role;
  if (!ROLES.includes(role)) return fail(400, 'BAD_ROLE', 'X-Role 값이 올바르지 않아요');

  const rawDate = h.get('X-Sim-Date');
  if (rawDate !== null && !isRealDate(rawDate)) return fail(400, 'BAD_SIM_DATE', 'X-Sim-Date 형식이 올바르지 않아요');
  const simDate: ISODate = rawDate ?? SIM_BASE_DATE;

  const rawTime = h.get('X-Sim-Time');
  if (rawTime !== null) {
    const m = /^(\d{2}):(\d{2})$/.exec(rawTime);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return fail(400, 'BAD_SIM_TIME', 'X-Sim-Time 형식이 올바르지 않아요');
  }
  const simTime: HHMM = rawTime ?? seoulTime();

  return {
    db,
    userId: h.get('X-User-Id') || null,
    role,
    simDate,
    simTime,
    staffGroupId: h.get('X-Staff-Group') || null,
    now: new Date().toISOString(),
    secret,
  };
}
