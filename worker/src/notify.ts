import { nanoid } from 'nanoid';
import type { Db } from './db';

/** Inserts an in-app notification once per dedupeKey (notifications.dedupe_key is UNIQUE). */
export async function notify(db: Db, userId: string, kind: string, text: string, link: string, dedupeKey: string | null, simDate: string | null = null): Promise<boolean> {
  const r = await db.run(
    'INSERT OR IGNORE INTO notifications (id, created_at, user_id, kind, text, link, dedupe_key, sim_date) VALUES (?,?,?,?,?,?,?,?)',
    nanoid(), new Date().toISOString(), userId, kind, text, link, dedupeKey, simDate,
  );
  return r.changes > 0;
}
