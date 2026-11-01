import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useSim } from '../lib/sim';
import { CommentList, type CommentItem } from './CommentList';
import { Editor, type Attachment } from './Editor';
import { Modal } from './Modal';
import { ReportModal } from './ReportModal';
import { showToast } from './Toast';
import { Button, Chip, EmptyState, Spinner } from './ui';
import { Paragraphs } from './linkify';
import { downloadFile, useFileUrl } from './useFileUrl';

export interface PostDetail {
  id: string; boardType: string; boardId: string; category: string; title: string; body: string;
  authorId: string; author: string; pinned: boolean; hidden: boolean; createdAt: string; simDate: string | null;
  viewCount: number; commentCount: number; likeCount: number; attachments: Attachment[]; liked: boolean; canManage: boolean;
  comments: CommentItem[];
}

function Img({ a }: { a: Attachment }) {
  const { url, failed } = useFileUrl(a.id);
  if (failed) return <p className="post-imgfail">{a.name}을 불러오지 못했어요</p>;
  return url ? <img className="post-img" src={url} alt={a.name} /> : <div className="post-img post-img-ph" aria-hidden="true" />;
}

/** 글 한 편: 본문 · 이미지 · 첨부 · 공감 · 신고 · (운영진) 고정 · 숨김 · (쓴 사람) 고치기 · 지우기 · 댓글 */
export function PostView({ postId, categories, canComment = true, commentNotice, onDeleted, onChanged }: {
  postId: string; categories: string[]; canComment?: boolean; commentNotice?: string; onDeleted?(): void; onChanged?(): void;
}) {
  const sim = useSim();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const load = useCallback(async () => {
    try {
      setPost(await api<PostDetail>(`/api/posts/${postId}`, { quiet: true }));
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 403 ? '볼 수 있는 권한이 없어요' : (e as Error).message || '글을 불러오지 못했어요');
    }
  }, [postId]);
  useEffect(() => { setPost(null); void load(); }, [load]);

  if (err) return <EmptyState title={err} />;
  if (!post) return <Spinner />;
  const mine = !!sim.userId && post.authorId === sim.userId && sim.role !== 'guest';

  const act = async (path: string, ok: string) => {
    try {
      await api(`/api/posts/${post.id}/${path}`, { method: 'POST', body: {}, quiet: true });
      showToast(ok);
      await load();
      onChanged?.();
    } catch (e) {
      showToast((e as Error).message || '처리하지 못했어요');
    }
  };
  const like = async () => {
    try {
      const r = await api<{ liked: boolean; likeCount: number }>(`/api/posts/${post.id}/like`, { method: 'POST', body: {}, quiet: true });
      setPost({ ...post, liked: r.liked, likeCount: r.likeCount });
    } catch (e) {
      showToast((e as Error).message || '공감하지 못했어요');
    }
  };
  const remove = async () => {
    try {
      await api(`/api/posts/${post.id}`, { method: 'DELETE', quiet: true });
      showToast('글을 지웠어요');
      setConfirmDel(false);
      onDeleted?.();
    } catch (e) {
      showToast((e as Error).message || '지우지 못했어요');
    }
  };

  const images = post.attachments.filter((a) => a.mime.startsWith('image/'));
  const files = post.attachments.filter((a) => !a.mime.startsWith('image/'));

  return (
    <article className="post">
      <header className="post-head">
        <div className="post-tags">
          {post.pinned && <Chip tone="yellow" square>공지 고정</Chip>}
          {post.category && <Chip tone="gray" square>{post.category}</Chip>}
          {post.hidden && <Chip tone="red" square>숨김</Chip>}
        </div>
        <h1 className="post-title">{post.title}</h1>
        <p className="post-meta">{post.author} · {post.simDate ?? post.createdAt.slice(0, 10)} · 조회 {post.viewCount}</p>
      </header>
      <Paragraphs text={post.body} />
      {images.map((a) => <Img key={a.id} a={a} />)}
      {files.length > 0 && (
        <ul className="post-files">
          {files.map((a) => (
            <li key={a.id}>
              <button type="button" className="link-btn" onClick={() => downloadFile(a.id, a.name).then(() => showToast('파일을 내려받았어요')).catch((e: Error) => showToast(e.message))}>📎 {a.name}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="post-actions">
        <Button variant={post.liked ? 'tint' : 'outline'} size="sm" pill aria-pressed={post.liked} onClick={() => void like()}>♥ 공감 {post.likeCount}</Button>
        <Button variant="ghost" size="sm" onClick={() => setReporting(true)}>신고</Button>
        <span className="post-spacer" />
        {post.canManage && (post.pinned
          ? <Button variant="outline" size="sm" onClick={() => void act('unpin', '공지 고정을 해제했어요')}>고정 해제</Button>
          : <Button variant="outline" size="sm" onClick={() => void act('pin', '공지로 고정했어요')}>고정</Button>)}
        {post.canManage && (post.hidden
          ? <Button variant="outline" size="sm" onClick={() => void act('unhide', '글을 다시 보이게 했어요 · 관리자 확인도 함께 닫혀요')}>다시 보이기</Button>
          : <Button variant="outline" size="sm" onClick={() => void act('hide', '글을 숨겼어요')}>숨기기</Button>)}
        {mine && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>고치기</Button>}
        {(mine || post.canManage) && <Button variant="ghost" size="sm" onClick={() => setConfirmDel(true)}>지우기</Button>}
      </div>
      <CommentList postId={post.id} comments={post.comments} canWrite={canComment && !post.hidden && sim.role !== 'guest'} notice={sim.role === 'guest' ? '로그인하면 댓글을 쓸 수 있어요' : commentNotice} onAdded={() => void load()} />
      {editing && (
        <Modal open onClose={() => setEditing(false)} title="글 고치기" width={640}>
          <Editor
            initial={{ title: post.title, body: post.body, attachments: post.attachments, category: post.category }}
            categories={categories}
            allowNotice={post.canManage}
            attachable={false}
            submitLabel="저장하기"
            onCancel={() => setEditing(false)}
            onSubmit={async (v) => {
              await api(`/api/posts/${post.id}`, { method: 'PATCH', body: { title: v.title, body: v.body, category: v.category }, quiet: true });
              showToast('글을 고쳤어요');
              setEditing(false);
              await load();
              onChanged?.();
            }}
          />
        </Modal>
      )}
      {reporting && <ReportModal targetType="post" targetId={post.id} onClose={() => setReporting(false)} />}
      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} danger title="글을 지울까요?" description="지운 글과 댓글은 되돌릴 수 없어요."
        footer={<><Button variant="ghost" pill onClick={() => setConfirmDel(false)}>취소</Button><Button variant="danger" pill onClick={() => void remove()}>지우기</Button></>} />
    </article>
  );
}
