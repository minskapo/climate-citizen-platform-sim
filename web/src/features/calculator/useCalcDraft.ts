import { useCallback } from 'react';
import { useSim } from '../../lib/sim';

/** 비회원 측정의 임시 저장 ID(localId)를 이 브라우저에 보관한다. 가입 직후 claim에 쓴다. */
export function useCalcDraft() {
  const sim = useSim();
  const pending = sim.pendingMeasurementIds;
  const setPending = sim.setPendingMeasurementIds;
  const remember = useCallback(
    (localId: string) => {
      if (!pending.includes(localId)) setPending([...pending, localId]);
    },
    [pending, setPending],
  );
  const forget = useCallback((localId: string) => setPending(pending.filter((x) => x !== localId)), [pending, setPending]);
  return { pending, remember, forget };
}

export function newLocalId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID ? c.randomUUID() : `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
