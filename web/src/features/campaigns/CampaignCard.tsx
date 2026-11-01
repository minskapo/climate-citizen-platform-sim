import { Link } from 'react-router-dom';
import { Chip } from '../../components/ui';
import { useFileUrl } from '../../components/useFileUrl';
import { useSim } from '../../lib/sim';
import { MODE_LABEL, periodLabel, STATUS_LABEL, STATUS_TONE, statusFor, TYPE_LABEL, TYPE_TONE, type CampaignListItem } from './types';

/** 캠페인 카드: 태그(유형 · 기간 · 방식) · 이름 · 주최 · 설명 2줄 · 인원 · 자세히 보기. */
export function CampaignCard({ c }: { c: CampaignListItem }) {
  const sim = useSim();
  const st = statusFor(c, sim.today);
  const img = useFileUrl(c.imageFileId);
  const people = st === 'scheduled'
    ? `${(c.subscriberCount ?? 0).toLocaleString('ko-KR')}명 알림 신청`
    : `${c.participantCount.toLocaleString('ko-KR')}명 참여`;
  return (
    <Link to={`/campaigns/${c.id}`} className="ccard">
      <div className={`ccard-img ccard-img-${st}`}>
        {img.url && <img src={img.url} alt="" />}
        <Chip tone={STATUS_TONE[st]} square className="ccard-status">{STATUS_LABEL[st]}</Chip>
      </div>
      <div className="ccard-body">
        <div className="ccard-tags">
          <Chip tone={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type]}</Chip>
          {periodLabel(c) && <Chip tone="gray">{periodLabel(c)}</Chip>}
          <Chip tone="gray">{MODE_LABEL[c.mode] ?? ''}</Chip>
        </div>
        <h3 className="ccard-title">{c.title}</h3>
        <p className="ccard-host">{c.host.name}</p>
        <p className="ccard-desc">{c.summary}</p>
        <div className="ccard-foot">
          <span>{people}</span>
          <span className="ccard-more">자세히 보기 →</span>
        </div>
      </div>
    </Link>
  );
}
