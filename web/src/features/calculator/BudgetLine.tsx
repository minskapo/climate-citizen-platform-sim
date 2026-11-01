import type { CSSProperties } from 'react';
import { CONFIG } from '@shared/calculator';

export const fmt = (n: number) => n.toFixed(1);

/** 탄소 예산선: 1.5도 한계선(2030 목표)까지 안쪽은 초록, 넘는 부분은 붉게. */
export function BudgetLine({ current, label = '나' }: { current: number; label?: string }) {
  const T = CONFIG.TARGET_2030;
  const K = CONFIG.KOREA_AVG;
  const max = Math.max(K, current * 1.08, T * 1.6);
  const p = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  const cP = p(current), tP = p(T), kP = p(K);
  const over = current > T;
  const showK = Math.abs(kP - cP) > 7;
  const place = (pct: number): CSSProperties =>
    pct < 17 ? { left: 0 } : pct > 83 ? { right: 0 } : { left: `${pct}%`, transform: 'translateX(-50%)' };
  return (
    <div className="calc-bl" role="img" aria-label={`탄소 예산선. 1.5℃ 한계선 ${fmt(T)}톤, ${label} ${fmt(current)}톤, 한국 평균 ${fmt(K)}톤.`}>
      <div className="bl-labels">
        <span className="bl-tag" style={place(tP)}>1.5℃ 한계선 {fmt(T)}톤</span>
        {showK && <span className="bl-tag dim" style={place(kP)}>한국 평균 {fmt(K)}톤</span>}
      </div>
      <div className="bl-track">
        <i className="within" style={{ width: `${Math.min(cP, tP)}%` }} />
        {over && <i className="over" style={{ left: `${tP}%`, width: `${cP - tP}%` }} />}
        {showK && <b className="k" style={{ left: `${kP}%` }} />}
        <b style={{ left: `${tP}%` }} />
      </div>
      <div className="bl-labels" style={{ marginTop: 6 }}>
        <span className={`bl-tag ${over ? 'is-over' : 'is-within'}`} style={place(cP)}>{label} {fmt(current)}톤</span>
      </div>
      <div className="bl-legend" style={{ marginTop: 26 }}>
        <span>● 목표 안쪽</span>
        {over && <span style={{ color: 'var(--c-danger)' }}>● 목표를 넘는 부분 {fmt(current - T)}톤</span>}
      </div>
    </div>
  );
}
