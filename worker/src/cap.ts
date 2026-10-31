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
