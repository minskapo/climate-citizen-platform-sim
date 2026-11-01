import { useState } from 'react';
import { CARBON_FACTORS, type Answers, type Question } from '@shared/calculator';

type Setter = (id: string, v: Answers[string]) => void;
type Items = ReadonlyArray<readonly [string, string, number]>;

function NumInput({ label, value, min = 0, max = 999, step = 1, plain, small, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; plain?: boolean; small?: boolean; onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const commit = (n: number) => {
    const c = Math.min(max, Math.max(min, n));
    setText(String(c));
    onChange(c);
  };
  return (
    <>
      {!plain && <button type="button" className="calc-step" aria-label={`${label} 줄이기`} onClick={() => commit(Math.round((value - step) * 100) / 100)}>−</button>}
      <input
        className={`calc-numin${small ? ' sm' : ''}`} type="number" inputMode="decimal" aria-label={label}
        min={min} max={max} step={step} value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0);
        }}
      />
      {!plain && <button type="button" className="calc-step" aria-label={`${label} 늘리기`} onClick={() => commit(Math.round((value + step) * 100) / 100)}>+</button>}
    </>
  );
}

/** 문항 한 개. 유형별 입력(num/one/yesno/count/multi). */
export function QuestionView({ q, answers, onChange }: { q: Question; answers: Answers; onChange: Setter }) {
  const v = answers[q.id];
  const radio = (i: number, label: string) => (
    <button key={i} type="button" role="radio" aria-checked={v === i} className="calc-opt" onClick={() => onChange(q.id, i)}>
      <span className="calc-dot" />{label}
    </button>
  );
  let body;
  if (q.type === 'num') {
    body = (
      <div className="calc-numrow">
        <NumInput key={q.id} label={q.t} value={typeof v === 'number' ? v : 0} min={q.min} max={q.max} step={q.step} plain={q.plain} onChange={(n) => onChange(q.id, n)} />
        <span className="calc-unit">{q.unit}</span>
      </div>
    );
  } else if (q.type === 'yesno') {
    body = <div className="calc-opts" role="radiogroup" aria-label={q.t}>{['아니오', '예'].map((o, i) => radio(i, o))}</div>;
  } else if (q.type === 'one') {
    body = <div className="calc-opts" role="radiogroup" aria-label={q.t}>{(q.o as string[]).map((o, i) => radio(i, o))}</div>;
  } else if (q.type === 'multi') {
    const sel = Array.isArray(v) ? (v as string[]) : [];
    body = (
      <div className="calc-opts" role="group" aria-label={q.t}>
        {(q.o as string[][]).map(([k, label]) => (
          <button key={k} type="button" role="checkbox" aria-checked={sel.includes(k)} className="calc-opt"
            onClick={() => onChange(q.id, sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k])}>
            <span className="calc-dot sq" />{label}
          </button>
        ))}
      </div>
    );
  } else {
    const items = (CARBON_FACTORS.consumption as unknown as Record<string, Items>)[q.items as string];
    const cur = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, number>;
    body = (
      <div className="calc-opts" style={{ gap: 0 }}>
        {items.map(([k, label]) => (
          <div key={k} className="calc-countrow">
            <span>{label}</span>
            <span className="calc-numrow" style={{ margin: 0 }}>
              <NumInput small label={label} value={cur[k] ?? 0} max={20} onChange={(n) => onChange(q.id, { ...cur, [k]: n })} />
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      <h2 className="calc-q">{q.t}</h2>
      {q.h && <p className="calc-help">{q.h}</p>}
      {body}
    </div>
  );
}
