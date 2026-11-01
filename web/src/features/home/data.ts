import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import type { CampaignDetail } from '../campaigns/types';
import type { GroupView } from '../groups/types';

export interface MeasurementFull {
  id: string; simDate: string; createdAt: string; campaignId: string | null; kind: string; place: string;
  result: { total: number }; actions: string[]; policies: string[];
}
export interface CalcAggregate { count: number; avg: number | null; policyCounts: Record<string, number> }

/** 모든 화면이 같은 방식으로 불러오고, 실패하면 빈 목록으로 둔다. */
function useLoad<T>(path: string | null, pick: (r: never) => T, deps: unknown[] = []): [T | null, () => void] {
  const [v, setV] = useState<T | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) { setV(null); return; }
    let alive = true;
    api<never>(path, { quiet: true }).then((r) => alive && setV(pick(r))).catch(() => alive && setV(null));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, n, ...deps]);
  return [v, useCallback(() => setN((x) => x + 1), [])];
}

export const useSignedIn = () => {
  const s = useSim();
  return s.role !== 'guest' && !!s.userId;
};

export function useMyCampaigns() {
  const signed = useSignedIn();
  const { today } = useSim();
  return useLoad<CampaignDetail[]>(signed ? '/api/me/participations' : null, (r: { items: CampaignDetail[] }) => r.items, [today]);
}

export function useMeasurements() {
  const signed = useSignedIn();
  return useLoad<MeasurementFull[]>(signed ? '/api/me/measurements' : null, (r: { items: MeasurementFull[] }) => r.items);
}

export function useCalcAggregate() {
  const signed = useSignedIn();
  return useLoad<CalcAggregate>('/api/aggregates/calculator', (r: CalcAggregate) => r, [signed]);
}

export function useMyGroups() {
  const signed = useSignedIn();
  return useLoad<GroupView[]>(signed ? '/api/groups?mine=1' : null, (r: { items: GroupView[] }) => r.items);
}
