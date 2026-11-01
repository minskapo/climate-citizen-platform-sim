import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CONFIG, ACTIONS } from '@shared/calculator';
import { koShort } from '@shared/date';
import { fmt } from '../calculator/BudgetLine';
import { useCalcAggregate, useMeasurements, type MeasurementFull } from '../home/data';
import { LoadError, Spinner } from '../../components/ui';

const PLACE: Record<string, string> = { home: '홈', menu: '상단 메뉴', campaign: '캠페인' };
const actionName = (id: string) => ACTIONS.find((a) => a.id === id)?.name ?? id;
const md = (d: string) => koShort(d).replace(/\(.\)$/, '');

function Chosen({ m }: { m: MeasurementFull }) {
  return (
    <div className="mcr-chosen">
      <div>
        <h4>고른 감축 행동</h4>
        {m.actions.length ? <ul>{m.actions.map((a) => <li key={a}>{actionName(a)}</li>)}</ul> : <p>아직 고르지 않았어요.</p>}
      </div>
      <div>
        <h4>고른 정책</h4>
        {m.policies.length ? <ul>{m.policies.map((p) => <li key={p}>{p}</li>)}</ul> : <p>아직 고르지 않았어요.</p>}
      </div>
    </div>
  );
}

/** E 나의 탄소 기록: 최근 측정 · 평균 비교 · 측정 목록 · 고른 감축 행동 · 고른 정책 */
export function MyCarbonRecords() {
  const [ms, retry, failed] = useMeasurements();
  const [agg] = useCalcAggregate();
  const [all, setAll] = useState(false);
  if (ms === null) return <section className="card mcr"><h2>나의 탄소 기록</h2>{failed ? <LoadError onRetry={retry} /> : <Spinner />}</section>;
  const latest = ms[0];
  const T = CONFIG.TARGET_2030;
  return (
    <section className="card mcr" aria-label="나의 탄소 기록">
      <div className="mcr-top"><h2>나의 탄소 기록</h2>{ms.length > 1 && <button type="button" className="link-btn" onClick={() => setAll((v) => !v)}>{all ? '접기' : '기록 전체 →'}</button>}</div>
      {!latest ? <p className="mcr-empty">아직 측정한 기록이 없어요. 가입 없이 5분이면 나의 1년 탄소를 알 수 있어요.</p> : (
        <>
          <p className="mcr-total">{fmt(latest.result.total)}톤 <small>{md(latest.simDate)} 측정</small></p>
          <dl className="hcalc-cmp">
            <div><dt>참여자 평균</dt><dd>{agg?.avg != null ? `${fmt(agg.avg)}톤` : '아직 집계 중'}</dd></div>
            <div><dt>나</dt><dd>{fmt(latest.result.total)}톤</dd></div>
            <div><dt>2030 1인당 목표</dt><dd>{fmt(T)}톤</dd></div>
          </dl>
          <ul className="mcr-list" aria-label="측정 목록">
            {(all ? ms : ms.slice(0, 3)).map((m) => (
              <li key={m.id}>
                <div><span>{koShort(m.simDate)}</span><span className="mcr-place">{PLACE[m.place] ?? m.place}{m.kind === 'start' ? ' · 출발점' : m.kind === 'end' ? ' · 마무리' : ''}</span><b>{fmt(m.result.total)}톤</b></div>
                {all && <Chosen m={m} />}
              </li>
            ))}
          </ul>
          {!all && <Chosen m={latest} />}
        </>
      )}
      <Link to="/calculator" className="btn btn-outline btn-md btn-block">{latest ? '다시 계산하기' : '계산하기'}</Link>
    </section>
  );
}
