import type { ISODate } from '@shared/types';
import type { Db } from './db';

export const DAILY_CAP = 80000;

/** Counts one API request for the given Seoul date and returns the new count for that day. */
export async function countRequest(db: Db, day: ISODate): Promise<number> {
  const row = await db.first<{ n: number }>(
    'INSERT INTO request_counts (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1 RETURNING n',
    day,
  );
  return row?.n ?? 1;
}

/** Writes (non-GET/HEAD/OPTIONS) are blocked once the day's count passes the cap. */
export function isBlocked(n: number, method: string): boolean {
  return n > DAILY_CAP && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

export const MAX_ENTER_FAILS = 10;

function seoulHourBucket(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}`;
}

export function enterFailKey(ip: string): string {
  return `enter_fail:${ip}:${seoulHourBucket()}`;
}

export async function enterFailCount(db: Db, key: string): Promise<number> {
  return (await db.first<{ n: number }>('SELECT n FROM request_counts WHERE day = ?', key))?.n ?? 0;
}

export async function recordEnterFail(db: Db, key: string): Promise<void> {
  await db.run('INSERT INTO request_counts (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1', key);
}
