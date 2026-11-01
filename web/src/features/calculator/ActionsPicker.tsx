import { ACTIONS, CONFIG, actionPotential, type CalcResult } from '@shared/calculator';
import { Button } from '../../components/ui';
import { fmt } from './BudgetLine';

/** 5.9톤 초과: 감축 가능성이 큰 행동을 최대 3개 고른다. */
export function ActionsPicker({ result, selected, onChange, onNext, busy }: {
  result: CalcResult; selected: string[]; onChange: (ids: string[]) => void; onNext: () => void; busy?: boolean;
}) {
  const max = CONFIG.ACTIONS_TO_PICK;
  const list = ACTIONS.map((a) => ({ a, pot: actionPotential(a.id, result) }))
    .filter((x) => x.pot > 0.001)
    .sort((x, y) => y.pot - x.pot);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : selected.length < max ? [...selected, id] : selected);
  return (
    <div>
      <h2 className="calc-q">줄이기 쉬운 행동을 골라 보세요</h2>
      <p className="calc-help">효과가 큰 순서예요. 최대 {max}개까지 고를 수 있어요. ({selected.length} / {max})</p>
      <div className="calc-pick" role="group" aria-label="감축 행동">
        {list.map(({ a, pot }) => {
          const on = selected.includes(a.id);
          return (
            <button key={a.id} type="button" role="checkbox" aria-checked={on} disabled={!on && selected.length >= max}
              className="calc-opt" style={{ height: 'auto', padding: 'var(--s-3) var(--s-4)' }} onClick={() => toggle(a.id)}>
              <span className="calc-dot sq" />
              <span><b>{a.name}</b><span className="calc-pick-sub">{a.desc}</span></span>
              <span className="calc-pick-pot">연 {fmt(pot)}톤</span>
            </button>
          );
        })}
      </div>
      <div className="calc-nav"><span /><Button size="lg" pill onClick={onNext} disabled={busy}>다음</Button></div>
    </div>
  );
}
