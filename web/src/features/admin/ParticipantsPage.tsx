import { useParams } from 'react-router-dom';
import { LoadError, Spinner } from '../../components/ui';
import { useAdminCrumbs } from './AdminLayout';
import { OfflineRoster } from './OfflineRoster';
import { ParticipantsPractice } from './ParticipantsPractice';
import { useParticipants } from './participantsCommon';
import { SignersPage } from './SignersPage';

/** /admin/campaigns/:id/participants — 캠페인 유형에 맞는 화면(M-1a · M-1s · M-1o)을 연다. */
export function ParticipantsPage() {
  const { id } = useParams();
  const { campaign, failed, reload } = useParticipants(id);
  useAdminCrumbs(['캠페인', campaign?.campaign.title ?? '…', '참가자']);
  if (failed) return <LoadError onRetry={() => void reload()} />;
  if (!campaign) return <Spinner />;
  const t = campaign.campaign.type;
  return t === 'signature' ? <SignersPage id={id!} /> : t === 'offline' ? <OfflineRoster id={id!} /> : <ParticipantsPractice id={id!} />;
}
