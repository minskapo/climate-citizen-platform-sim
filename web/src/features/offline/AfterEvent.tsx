import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { koShort } from '@shared/date';
import { api } from '../../lib/api';
import { share } from '../../lib/share';
import { Editor } from '../../components/Editor';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { Button, Chip } from '../../components/ui';
import { BlockSlotView } from '../campaigns/BlockSlotView';
import { HostCard } from '../campaigns/HostCard';
import { ParticipantBoard } from '../campaigns/ParticipantBoard';
import { periodLabel, type CampaignDetail, type CampaignListItem } from '../campaigns/types';
import { ReviewForm, useReviewTarget } from '../practice/ReviewForm';
import { atTime, type Attendance } from './util';

/** 사진 올리기: 후기가 올라가는 게시판(주최 모임 또는 참가자 게시판)에 「후기」 분류로 사진과 함께 올려요. */
function PhotoModal({ detail, onClose, onPosted }: { detail: CampaignDetail; onClose(): void; onPosted(): void }) {
  const c = detail.campaign;
  const groupBoard = useReviewTarget(detail);
  return (
    <Modal open onClose={onClose} title="사진 올리기" width={640}
      description={groupBoard ? `주최 모임 「${c.host.name}」 게시판의 「후기」에 올라가요.` : '참가자 게시판의 「후기」에 올라가요.'}>
      <Editor
        categories={['후기']} allowNotice={false} initial={{ category: '후기', title: '', body: '', attachments: [] }} onCancel={onClose}
        onSubmit={async (v) => {
          const path = groupBoard ? `/api/boards/group/${c.host.id}/posts` : `/api/boards/campaign/${c.id}/posts`;
          await api(path, { body: { category: '후기', title: v.title, body: v.body, attachments: v.attachments }, quiet: true });
          const photos = v.attachments.filter((a) => a.mime.startsWith('image/')).length;
          showToast(photos ? `사진 ${photos}장을 올렸어요` : '후기를 올렸어요 · 게시판 「후기」에 모여요');
          onClose();
          onPosted();
        }}
      />
    </Modal>
  );
}

/** 같은 주최 모임의 모집 중 캠페인 */
function NextTrips({ detail }: { detail: CampaignDetail }) {
  const c = detail.campaign;
  const [items, setItems] = useState<CampaignListItem[] | null>(null);
  useEffect(() => {
    if (c.host.type !== 'group' || !c.host.id) { setItems([]); return; }
    let alive = true;
    api<{ items: CampaignListItem[] }>(`/api/campaigns?hostGroupId=${encodeURIComponent(c.host.id)}&status=recruiting`, { quiet: true })
      .then((r) => alive && setItems((r.items ?? []).filter((x) => x.id !== c.id)))
      .catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [c.host.type, c.host.id, c.id]);
  if (c.host.type !== 'group') return null;
  return (
    <section className="card coff-next" aria-label="다음 탐방">
      <h2>다음 탐방과 가까운 모임</h2>
      <p className="coff-sub">{c.host.name}은 계속 모임을 이어 가요. 모집 중인 모임에서 이야기를 이어 갈 수 있어요.</p>
      {items && items.length === 0 && <p className="coff-sub" role="status">지금 모집 중인 다음 모임은 없어요. 새 모임이 열리면 알려 드릴게요.</p>}
      {items && items.length > 0 && (
        <ul>
          {items.slice(0, 3).map((x) => (
            <li key={x.id}>
              <Chip tone="solid" square>모집 중</Chip>
              <Link to={`/campaigns/${x.id}`}><strong>{x.title}</strong></Link>
              <small>{periodLabel(x)}</small>
            </li>
          ))}
        </ul>
      )}
      {c.host.id && <Link to={`/groups/${c.host.id}`} className="link-btn">모임 보기 →</Link>}
    </section>
  );
}

/** O-4 끝난 뒤: 출석 기록 · 사진 올리기 · 후기 · 다음 탐방 · 참여 확인서 */
export function AfterEvent({ detail, attendance, onPosted }: { detail: CampaignDetail; attendance: Attendance | null; onPosted(): void }) {
  const c = detail.campaign;
  const s = c.schedule;
  const [photo, setPhoto] = useState(false);
  const attended = !!attendance;
  const when = s.eventDate ? koShort(s.eventDate).replace(/\(.\)$/, '') : '';
  return (
    <div className="cdetail">
      <div className="cdetail-main">
        <section className="cbanner" aria-label="끝난 뒤">
          <div>
            <h2>{attended ? '함께해 주셔서 고마워요!' : '모임이 끝났어요'}</h2>
            <p>{attended
              ? `${when} ${c.title}에 출석했어요. 후기와 현장 사진을 남겨 주면 모임 게시판 「후기」에 모여요.`
              : '출석 기록이 없어요. 다녀오셨다면 후기와 사진을 남겨 주세요. 출석 확인이 빠졌다면 운영진에게 알려 주세요.'}</p>
          </div>
          <Button className="cbanner-btn" variant="outline" pill onClick={() => setPhoto(true)}>사진 올리기</Button>
        </section>
        <BlockSlotView campaignId={c.id} screen="after" slot="top" />
        {attended && (
          <section className="card coff-record" aria-label="참여 기록">
            <p className="chost-label">참여 기록</p>
            <strong>{c.title} · {when} 출석{attendance ? ` ${atTime(attendance.at)}` : ''}</strong>
            <div className="coff-actions">
              <a className="btn btn-outline btn-md" href="#review" onClick={(e) => { e.preventDefault(); document.getElementById('review')?.scrollIntoView({ behavior: 'smooth' }); }}>후기 남기기</a>
              <Link className="btn btn-outline btn-md" to={`/campaigns/${c.id}/certificate`}>참여 확인서 받기</Link>
              <Button variant="outline" onClick={() => share(`/campaigns/${c.id}`, c.title)}>공유하기</Button>
            </div>
          </section>
        )}
        <div id="review">
          <ReviewForm detail={detail} placeholder="가장 기억에 남는 이야기, 우리 집이나 동네에서 해 보고 싶은 것을 적어 주세요." next="다음 모임을 준비하는 데에도 쓰여요." />
        </div>
        <NextTrips detail={detail} />
        <BlockSlotView campaignId={c.id} screen="after" slot="after_common" />
        <BlockSlotView campaignId={c.id} screen="after" slot="bottom" />
        <ParticipantBoard detail={detail} variant="compact" />
      </div>
      <aside className="cdetail-side"><HostCard host={c.host} compact /></aside>
      {photo && <PhotoModal detail={detail} onClose={() => setPhoto(false)} onPosted={onPosted} />}
    </div>
  );
}
