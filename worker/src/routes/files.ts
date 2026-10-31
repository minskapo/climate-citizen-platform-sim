import { fail, type Handler } from '../db';
import { loadBoard } from './posts';

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
  }
  const bytes = f.data instanceof ArrayBuffer ? new Uint8Array(f.data) : Uint8Array.from(f.data as ArrayLike<number>);
  return new Response(bytes, {
    headers: {
      'content-type': f.mime,
      'content-disposition': f.mime.startsWith('image/') ? 'inline' : 'attachment',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=300',
    },
  });
};
