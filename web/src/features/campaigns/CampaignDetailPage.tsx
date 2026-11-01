import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { EmptyState, Spinner } from '../../components/ui';
import { PracticeDetail } from '../practice/PracticeDetail';
import { OfflineDetail } from '../offline/OfflineDetail';
import { SignatureDetail } from '../signature/SignatureDetail';
import { CampaignContext, type CampaignDetail } from './types';
import './campaigns.css';

export interface DetailLocationState { completed?: boolean; waitlisted?: boolean; attended?: string; notice?: string }

export function useCampaignDetail(id: string) {
  const sim = useSim();
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setDetail(await api<CampaignDetail>(`/api/campaigns/${id}`, { quiet: true }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? '캠페인을 찾을 수 없어요' : (e as Error).message || '캠페인을 불러오지 못했어요');
    }
    // 내 날짜 · 역할 · 활동명이 바뀌면 다시 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sim.today, sim.userId, sim.role, sim.staffGroupId]);
  useEffect(() => { void load(); }, [load]);
  return { detail, error, reload: load };
}

/** /campaigns/:id — 유형 · 내 참여 · 내 날짜에 따라 상세 / 시작 전 / 진행 / 마무리 · 서명 · 오프라인 화면을 고른다. */
export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const state = (location.state ?? {}) as DetailLocationState;
  const { detail, error, reload } = useCampaignDetail(id);

  if (error) return <div className="container page"><EmptyState title={error}>목록에서 다른 캠페인을 골라 보세요.</EmptyState></div>;
  if (!detail || detail.campaign.id !== id) return <div className="container page"><Spinner /></div>;
  return (
    <CampaignContext.Provider value={{ detail, reload }}>
      {detail.campaign.type === 'practice'
        ? <PracticeDetail detail={detail} reload={reload} completed={!!state.completed} />
        : detail.campaign.type === 'signature'
          ? <SignatureDetail detail={detail} reload={reload} />
          : <OfflineDetail detail={detail} reload={reload} completed={!!state.completed} attended={state.attended ?? null} notice={state.notice ?? null} />}
    </CampaignContext.Provider>
  );
}
