import { Button } from '../../components/ui';

/** 정책 고르기(여러 개). 같은 정책을 고른 시민들의 목소리는 정책 제안에 쓰여요. */
export function PolicyPicker({ list, selected, onChange, onDone, busy }: {
  list: readonly string[]; selected: string[]; onChange: (v: string[]) => void; onDone: () => void; busy?: boolean;
}) {
  const toggle = (p: string) => onChange(selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p]);
  return (
    <div>
      <h2 className="calc-q">우리 동네에 가장 필요한 기후정책은 무엇일까요?</h2>
      <p className="calc-help">여러 개를 골라도 돼요. 같은 정책을 고른 시민들의 목소리는 정책 제안에 쓰여요.</p>
      <div className="calc-opts" role="group" aria-label="정책">
        {list.map((p) => (
          <button key={p} type="button" role="checkbox" aria-checked={selected.includes(p)} className="calc-opt" onClick={() => toggle(p)}>
            <span className="calc-dot sq" />{p}
          </button>
        ))}
      </div>
      <div className="calc-nav"><span /><Button size="lg" pill onClick={onDone} disabled={busy}>완료</Button></div>
    </div>
  );
}
