import { fail, type Handler } from '../db';
import { isStaffRole, memberRole } from './groups';
import { loadBoard } from './posts';

const RASTER = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export const getFile: Handler = async (_req, ctx, p) => {
  const f = await ctx.db.first<{ mime: string; data: ArrayLike<number> | ArrayBuffer; post_id: string | null }>(
    'SELECT mime, data, post_id FROM files WHERE id = ?',
    p.id,
  );
  if (!f) return fail(404, 'FILE_NOT_FOUND', '파일을 찾을 수 없어요');
  if (f.post_id) {
    const post = await ctx.db.first<{ board_type: string; board_id: string; hidden: number; author_id: string }>(
      'SELECT board_type, board_id, hidden, author_id FROM posts WHERE id = ?',
      f.post_id,
    );
    if (post) {
      const b = await loadBoard(ctx, post.board_type, post.board_id);
      if (b instanceof Response) return b;
      if (!b.canRead) return fail(403, 'FORBIDDEN', '볼 수 있는 권한이 없어요');
      if (post.hidden && !b.staff && post.author_id !== ctx.userId) return fail(404, 'FILE_NOT_FOUND', '파일을 찾을 수 없어요');
    }
  } else {
    // Campaign-exclusive files: participants, host-group staff and admins only.
    const cf = await ctx.db.all<{ campaign_id: string; exclusive: number }>('SELECT campaign_id, exclusive FROM campaign_files WHERE file_id = ?', p.id);
    if (cf.length > 0 && cf.every((r) => r.exclusive) && ctx.role !== 'admin') {
      let ok = false;
      for (const r of cf) {
        const c = await ctx.db.first<{ host_group_id: string | null }>('SELECT host_group_id FROM campaigns WHERE id = ?', r.campaign_id);
        const part = ctx.userId ? await ctx.db.first('SELECT id FROM participations WHERE campaign_id = ? AND user_id = ?', r.campaign_id, ctx.userId) : null;
        const role = c?.host_group_id ? await memberRole(ctx, c.host_group_id, ctx.userId) : null;
        if (part || (c?.host_group_id && isStaffRole(ctx, c.host_group_id, role))) { ok = true; break; }
      }
      if (!ok) return fail(403, 'FORBIDDEN', '참가자만 볼 수 있는 파일이에요');
    }
  }
  const bytes = f.data instanceof ArrayBuffer ? new Uint8Array(f.data) : Uint8Array.from(f.data as ArrayLike<number>);
  const inline = RASTER.includes(f.mime);
  return new Response(bytes, {
    headers: {
      'content-type': inline ? f.mime : 'application/octet-stream',
      'content-disposition': inline ? 'inline' : 'attachment',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=300',
    },
  });
};
