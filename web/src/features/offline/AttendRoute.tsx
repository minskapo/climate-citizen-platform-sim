import { useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { Spinner } from '../../components/ui';
import type { CampaignDetail } from '../campaigns/types';
import { atTime, attendanceGate } from './util';

/** /attend/:campaignId?code=XXXXXX — 휴대폰으로 QR을 찍으면 열려요. 신청한 참가자면 바로 출석하고, 아니면 캠페인 화면으로 보내요. */
export function AttendRoute() {
  const { campaignId = '' } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const sim = useSim();
  const ran = useRef(false);
  const code = (sp.get('code') ?? '').replace(/\D/g, '');

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const back = (state: { attended?: string; notice?: string }) => nav(`/campaigns/${campaignId}`, { replace: true, state });
    (async () => {
      if (!sim.userId || sim.role === 'guest') { back({ notice: '로그인하면 출석할 수 있어요. 로그인한 뒤 QR을 다시 찍어 주세요' }); return; }
      try {
        const d = await api<CampaignDetail>(`/api/campaigns/${campaignId}`, { quiet: true });
        if (d.myParticipation?.state !== 'applied') { back({ notice: '신청이 확정된 참가자만 출석할 수 있어요' }); return; }
        const gate = attendanceGate(d.campaign.schedule, sim.today, sim.nowTime);
        if (!gate.open) { back({ notice: gate.message ?? '' }); return; }
        if (!/^\d{6}$/.test(code)) { back({ notice: '출석 코드가 맞지 않아요. 「QR 찍고 출석하기」에서 코드를 넣어 주세요' }); return; }
        const r = await api<{ at: string }>(`/api/campaigns/${campaignId}/attend`, { body: { code }, quiet: true });
        back({ attended: atTime(r.at) });
      } catch (e) {
        back({ notice: (e as Error).message || '출석하지 못했어요' });
      }
    })();
  }, [campaignId, code, nav, sim.userId, sim.role, sim.today, sim.nowTime]);

  return <div className="container page"><Spinner label="출석을 확인하고 있어요" /></div>;
}
