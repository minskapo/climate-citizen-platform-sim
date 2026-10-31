import { fail, type Handler } from '../db';
import { canUseExclusive, explainerVisible } from './campaigns';
import { loadBoard } from './posts';

const RASTER = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export const getFile: Handler = async (_req, ctx, p) => {
  const f = await ctx.db.first<{ mime: string; data: ArrayLike<number> | ArrayBuffer; post_id: string | null }>(
    'SELECT mime, data, post_id FROM files WHERE id = ?',
    p.id,
  );
  if (!f) return fail(404, 'FILE_NOT_FOUND', '파일을 찾을 수 없어요');
  if (f.post_id) {
    const post = await ctx.db.first<{ board_type: string; board_id: string; hidden: number; author_id: string; category: string }>(
      'SELECT board_type, board_id, hidden, author_id, category FROM posts WHERE id = ?',
      f.post_id,
    );
    if (post && post.board_type === 'campaign' && post.category === 'explainer') {
      // 서명 설명 글 is public wherever the campaign itself is visible.
      if (!(await explainerVisible(ctx, post.board_id))) return fail(404, 'FILE_NOT_FOUND', '파일을 찾을 수 없어요');
    } else if (post) {
      const b = await loadBoard(ctx, post.board_type, post.board_id);
      if (b instanceof Response) return b;
      if (!b.canRead) return fail(403, 'FORBIDDEN', '볼 수 있는 권한이 없어요');
      if (post.hidden && !b.staff && post.author_id !== ctx.userId) return fail(404, 'FILE_NOT_FOUND', '파일을 찾을 수 없어요');
    }
  } else {
    // Campaign files: if ANY link is exclusive, the viewer must be a participant / host-group staff / admin
    // of at least one of the exclusive campaigns (a non-exclusive link elsewhere does not open it up).
    const cf = await ctx.db.all<{ campaign_id: string; host_group_id: string | null }>(
      'SELECT cf.campaign_id, c.host_group_id FROM campaign_files cf LEFT JOIN campaigns c ON c.id = cf.campaign_id WHERE cf.file_id = ? AND cf.exclusive = 1',
      p.id,
    );
    if (cf.length > 0) {
      let ok = false;
      for (const r of cf) if (await canUseExclusive(ctx, r.campaign_id, r.host_group_id)) { ok = true; break; }
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
