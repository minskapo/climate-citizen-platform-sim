import type { Aggregate } from './parts';

const n = (x: number) => x.toLocaleString('ko-KR');

/** 지역별 서명 수. 10명 미만 지역은 서버가 「그 밖」으로 묶어 준다. */
export function RegionalCounts({ agg }: { agg: Aggregate | null }) {
  const empty = !agg || (agg.byRegion.length === 0 && agg.other.n === 0);
  return (
    <section className="card sig-region" aria-label="지역별 서명 수">
      <h2 className="csec-title">지역별 서명 수</h2>
      <p className="csec-sub">사는 지역별로 묶어 그 지역 의회에 전달해요.</p>
      {empty ? <p className="sig-note">아직 지역별로 보여 줄 서명이 없어요.</p> : (
        <ul>
          {agg.byRegion.map((r) => <li key={r.name}><span>{r.name}</span><strong>{n(r.n)}명</strong></li>)}
          {agg.other.n > 0 && <li><span>그 밖 {agg.other.regions}곳</span><strong>{n(agg.other.n)}명</strong></li>}
        </ul>
      )}
    </section>
  );
}
