import { SOCIAL_FOUNDATION } from '@shared/calculator';
import { Button } from '../../components/ui';

export const SECTOR_NAME: Record<string, string> = { food: '먹거리', consumption: '소비', transport: '이동', housing: '에너지', leisure: '여가' };

/** 5.9톤 이하: 사회적 기초 - 해당하는 어려움을 고른다. */
export function SocialFoundation({ selected, onChange, onNext, busy }: {
  selected: string[]; onChange: (v: string[]) => void; onNext: () => void; busy?: boolean;
}) {
  const toggle = (it: string) => onChange(selected.includes(it) ? selected.filter((x) => x !== it) : [...selected, it]);
  return (
    <div>
      <h2 className="calc-q">목표 안쪽이어도 불편한 점이 있을 수 있어요</h2>
      <p className="calc-help">해당하는 것을 모두 골라 주세요. 없으면 그대로 다음으로 넘어가도 돼요.</p>
      {SOCIAL_FOUNDATION.map((g) => (
        <div key={g.sector}>
          <p className="calc-group">{SECTOR_NAME[g.sector]}</p>
          <div className="calc-opts" style={{ margin: 0 }} role="group" aria-label={SECTOR_NAME[g.sector]}>
            {g.items.map((it) => (
              <button key={it} type="button" role="checkbox" aria-checked={selected.includes(it)} className="calc-opt" onClick={() => toggle(it)}>
                <span className="calc-dot sq" />{it}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="calc-nav" style={{ marginTop: 'var(--s-6)' }}><span /><Button size="lg" pill onClick={onNext} disabled={busy}>다음</Button></div>
    </div>
  );
}
