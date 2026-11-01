import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QUESTIONS } from '@shared/calculator';
import { Button } from '../../components/ui';
import './calculator.css';

/** 홈 카드: 첫 문항만 바로 답하고 「다음」으로 계산기에 이어 간다. */
export function HomeCalcCard() {
  const q = QUESTIONS.food[0];
  const [v, setV] = useState('');
  const nav = useNavigate();
  const go = () => {
    const n = Number(v);
    const ok = v.trim() !== '' && Number.isFinite(n);
    nav(ok ? `/calculator?from=home&q1=${Math.min(q.max ?? 999, Math.max(0, n))}` : '/calculator?from=home');
  };
  return (
    <div className="card calc-homecard">
      <span className="chip chip-green" style={{ justifySelf: 'start' }}>1.5도 계산기 · 가입 없이</span>
      <h3>{q.t}</h3>
      <div className="calc-numrow">
        <input className="calc-numin" type="number" inputMode="numeric" min={0} max={q.max} aria-label={q.t} value={v} placeholder="0" onChange={(e) => setV(e.target.value)} />
        <span className="calc-unit">{q.unit}</span>
      </div>
      <Button size="lg" block onClick={go}>다음</Button>
    </div>
  );
}
