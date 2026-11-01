import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { koShort } from '@shared/date';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { BoardList, type PostSummary } from '../../components/BoardList';
import { Editor } from '../../components/Editor';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { Button, Chip, EmptyState } from '../../components/ui';
import { useParticipantTab } from './CampaignHeader';
import type { CampaignDetail } from './types';
import '../groups/groups.css';

export const CAMPAIGN_BOARD_CATEGORIES = ['공지', '인사', '인증', '자유', '자료', '후기'];
const CAT_TONE: Record<string, 'yellow' | 'green' | 'blue' | 'gray'> = { 공지: 'yellow', 인사: 'green', 인증: 'green', 자료: 'blue', 후기: 'green' };

export const postPath = (campaignId: string, postId: string) => `/campaigns/${campaignId}/posts/${postId}`;
const dateOf = (p: PostSummary) => p.simDate ?? p.createdAt.slice(0, 10);
const short = (d: string) => koShort(d).replace(/\(.\)$/, '');

/** 이 캠페인 게시판의 운영진(주최 모임 운영진 · 관리자)인지 — 공지 쓰기 버튼에만 쓴다. 실제 검사는 Worker가 한다. */
export function useBoardStaff(detail: CampaignDetail): boolean {
  const sim = useSim();
  return sim.role === 'admin' || (sim.role === 'staff' && !!detail.campaign.hostGroupId && sim.staffGroupId === detail.campaign.hostGroupId);
}

export function useBoardPosts(campaignId: string, opts: { category?: string; enabled: boolean; reloadKey?: number }) {
  const [items, setItems] = useState<PostSummary[] | null>(null);
  const [denied, setDenied] = useState(false);
  const load = useCallback(async () => {
    if (!opts.enabled) { setItems([]); setDenied(true); return; }
    const sp = new URLSearchParams();
    if (opts.category) sp.set('category', opts.category);
    try {
      const r = await api<{ items: PostSummary[] }>(`/api/boards/campaign/${campaignId}/posts?${sp}`, { quiet: true });
      setItems(r.items);
      setDenied(false);
    } catch {
      setItems([]);
      setDenied(true);
    }
  }, [campaignId, opts.category, opts.enabled]);
  useEffect(() => { void load(); }, [load, opts.reloadKey]);
  return { items, denied, reload: load };
}

/** 글쓰기 창(참가자 게시판). category를 주면 그 분류로 시작한다. */
export function BoardWriteModal({ detail, category, onClose, onPosted }: { detail: CampaignDetail; category?: string; onClose(): void; onPosted?(): void }) {
  const staff = useBoardStaff(detail);
  return (
    <Modal open onClose={onClose} title="글쓰기" description="지금 보고 있는 게시판에 올라가요. 「공지」는 운영진만 쓸 수 있어요." width={640}>
      <Editor
        categories={CAMPAIGN_BOARD_CATEGORIES}
        allowNotice={staff}
        initial={category ? { category, title: '', body: '', attachments: [] } : undefined}
        onCancel={onClose}
        onSubmit={async (v) => {
          await api(`/api/boards/campaign/${detail.campaign.id}/posts`, { body: { category: v.category, title: v.title, body: v.body, attachments: v.attachments }, quiet: true });
          const photos = v.attachments.filter((a) => a.mime.startsWith('image/')).length;
          showToast(photos ? `사진 ${photos}장을 올렸어요` : '글을 올렸어요');
          onClose();
          onPosted?.();
        }}
      />
    </Modal>
  );
}

function Rows({ detail, items, meta }: { detail: CampaignDetail; items: PostSummary[]; meta: 'author' | 'date' }) {
  return (
    <ul className="cboard-rows">
      {items.map((p) => (
        <li key={p.id}>
          <Link to={postPath(detail.campaign.id, p.id)}>
            <Chip tone={CAT_TONE[p.category] ?? 'gray'} className="cboard-cat">{p.category || '글'}</Chip>
            <span className="cboard-title">{p.title}</span>
            <span className="cboard-meta">{p.author}{meta === 'date' ? `  ${short(dateOf(p))}` : ''}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * 참가자 게시판.
 * - preview: 상세(신청 전) — 참가자가 아니면 글 내용이 잠긴다
 * - compact: 시작 전 — 최근 글 몇 개 + 글쓰기
 * - today: 진행 중 — 오늘의 인증 + 「게시판 전체 →」
 * - full: 참가자 게시판 탭
 */
export function ParticipantBoard({ detail, variant, reloadKey = 0 }: { detail: CampaignDetail; variant: 'preview' | 'compact' | 'today' | 'full'; reloadKey?: number }) {
  const sim = useSim();
  const c = detail.campaign;
  const mine = detail.myParticipation;
  const staff = useBoardStaff(detail);
  const member = !!mine && mine.state !== 'cancelled';
  const canRead = member || staff;
  const [writing, setWriting] = useState(false);
  const [tick, setTick] = useState(0);
  const [, setTab] = useParticipantTab();
  const { items, denied } = useBoardPosts(c.id, { enabled: canRead && variant !== 'full' && !!sim.userId, category: variant === 'today' ? '인증' : undefined, reloadKey: reloadKey + tick });

  if (variant === 'full') {
    return (
      <BoardList
        type="campaign" id={c.id} categories={CAMPAIGN_BOARD_CATEGORIES} postHref={(pid) => postPath(c.id, pid)}
        canWrite={canRead && mine?.state !== 'quit'} allowNotice={staff} title="참가자 게시판" reloadKey={reloadKey}
      />
    );
  }

  if (variant === 'preview') {
    const lead = c.host.type === 'group'
      ? `참여 신청하면 주최 모임 「${c.host.name}」에 가입되고, 이 캠페인 전용 게시판을 함께 쓸 수 있어요.`
      : '참여 신청하면 이 캠페인 전용 게시판을 함께 쓸 수 있어요.';
    return (
      <section className="cboard-sec" aria-label="참가자 게시판">
        <h2 className="csec-title">참가자 게시판</h2>
        {!canRead && <p className="csec-sub">{lead}</p>}
        <div className="card cboard">
          {canRead && items && items.length > 0 && <Rows detail={detail} items={items.slice(0, 5)} meta="author" />}
          {canRead && items && items.length === 0 && !denied && <EmptyState title="아직 올라온 글이 없어요" />}
          <p className="cboard-lock">{canRead ? <button type="button" className="link-btn" onClick={() => setTab('board')}>게시판 전체 →</button> : '글 내용은 참가자만 볼 수 있어요'}</p>
        </div>
      </section>
    );
  }

  if (variant === 'compact') {
    return (
      <section className="card cboard cboard-compact" aria-label="참가자 게시판">
        <div className="cboard-head">
          <h2>참가자 게시판</h2>
          <Button onClick={() => setWriting(true)}>글쓰기</Button>
        </div>
        {items && items.length === 0 && <EmptyState title="아직 올라온 글이 없어요">먼저 인사를 남겨 보세요.</EmptyState>}
        {items && items.length > 0 && <Rows detail={detail} items={items.slice(0, 4)} meta="date" />}
        {writing && <BoardWriteModal detail={detail} onClose={() => setWriting(false)} onPosted={() => setTick((n) => n + 1)} />}
      </section>
    );
  }

  // today: 오늘의 인증
  const today = (items ?? []).filter((p) => dateOf(p) === sim.today);
  const shown = (today.length ? today : items ?? []).slice(0, 3);
  return (
    <section className="card cboard cboard-today" aria-label="참가자 게시판 · 오늘의 인증">
      <div className="cboard-head">
        <h2>참가자 게시판 · 오늘의 인증</h2>
        <button type="button" className="link-btn" onClick={() => setTab('board')}>게시판 전체 →</button>
      </div>
      {items && shown.length === 0 && <EmptyState title="아직 올라온 인증이 없어요">기록을 저장할 때 「참가자 게시판에도 인증 올리기」를 켜 보세요.</EmptyState>}
      {shown.length > 0 && (
        <ul className="cproof">
          {shown.map((p) => (
            <li key={p.id}>
              <Link to={postPath(c.id, p.id)}>
                <span className="cproof-thumb" aria-hidden="true">{p.attachmentCount ? '사진' : '인증'}</span>
                <span className="cproof-main">
                  <strong>{p.title}</strong>
                  <small>{p.author} · 댓글 {p.commentCount} · 공감 {p.likeCount}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
