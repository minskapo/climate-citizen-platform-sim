import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { CollabModal } from '../collab/CollabModal';
import { ButtonLink, Button, Chip } from '../../components/ui';
import type { CampaignListItem } from '../campaigns/types';
import type { GroupView } from '../groups/types';
import { CampaignSection } from './CampaignSection';
import { useCalcAggregate, useMeasurements } from './data';
import { GroupSection } from './GroupSection';
import { GuestHero, MemberHero } from './Hero';
import { MyGroupNews } from './MyGroupNews';
import { PopularPosts } from './PopularPosts';
import { StickyCalcBar } from './StickyCalcBar';
import { useMyGroups } from './data';
import './home.css';

async function loadCampaigns(): Promise<CampaignListItem[]> {
  const out: CampaignListItem[] = [];
  for (const status of ['recruiting', 'running']) {
    try { out.push(...(await api<{ items: CampaignListItem[] }>(`/api/campaigns?status=${status}`, { quiet: true })).items); } catch { /* 한쪽이 실패해도 나머지를 보여 준다 */ }
  }
  return out;
}

/** A · A-1 · A-2 홈 */
export function HomePage() {
  const sim = useSim();
  const signed = sim.role !== 'guest' && !!sim.userId;
  const [camps, setCamps] = useState<CampaignListItem[] | null>(null);
  const [groups, setGroups] = useState<GroupView[] | null>(null);
  const [mine] = useMyGroups();
  const [ms] = useMeasurements();
  const [agg] = useCalcAggregate();
  const [collab, setCollab] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadCampaigns().then((l) => alive && setCamps(l));
    api<{ items: GroupView[] }>('/api/groups', { quiet: true }).then((r) => alive && setGroups(r.items)).catch(() => alive && setGroups([]));
    return () => { alive = false; };
  }, [sim.today, signed]);

  return (
    <div className="home">
      {signed ? <MemberHero suggested={camps} /> : <GuestHero />}
      {signed && <MyGroupNews groups={mine} />}
      <CampaignSection items={camps} nickname={signed ? sim.nickname : null} />
      <PopularPosts />
      <GroupSection groups={groups} member={signed} />
      <section className="container hsec" aria-label="모임 열기 안내">
        <div className="hopen">
          <Chip tone="outline" className="hopen-chip">지역 단체 · 모임 운영자</Chip>
          <h2>우리 동네 시민을 함께 모아 보세요</h2>
          <p>모임을 열어 동네 사람들과 함께 실천을 이어 가요.</p>
          <div className="hopen-btns">
            <ButtonLink to="/groups/new" size="lg" variant="outline" className="hopen-b1">모임 열기</ButtonLink>
            <Button size="lg" variant="ghost" className="hopen-b2" onClick={() => setCollab(true)}>캠페인 협업 제안</Button>
          </div>
        </div>
      </section>
      <StickyCalcBar agg={agg} measured={signed ? (ms === null ? null : ms.length > 0) : null} />
      {collab && <CollabModal onClose={() => setCollab(false)} />}
    </div>
  );
}
