import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSim } from '../../lib/sim';
import { CalcAggregate } from './data';

export const DISMISS_KEY = 'home.calcbar.dismissed';
const SHOW_AFTER = 480;

function dismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

/** A-1 하단 고정 바: 계산 전 비회원에게만. 히어로를 지나면 나타나고, 닫으면 기억해 다시 띄우지 않는다.
 *  measured: 로그인한 회원이 이미 측정했는지(불러오는 중이면 null). */
export function StickyCalcBar({ agg, measured }: { agg: CalcAggregate | null; measured: boolean | null }) {
  const sim = useSim();
  const [scrolled, setScrolled] = useState(() => (typeof window !== 'undefined' ? window.scrollY > SHOW_AFTER : false));
  const [closed, setClosed] = useState(dismissed);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > SHOW_AFTER);
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const signed = sim.role !== 'guest' && !!sim.userId;
  const hide = closed || !scrolled || sim.pendingMeasurementIds.length > 0 || (signed && measured !== false);
  if (hide) return null;
  const close = () => {
    setClosed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* 기억하지 못해도 이번 화면에서는 닫아 둔다 */ }
  };
  return (
    <div className="hbar" role="region" aria-label="계산기 안내">
      <div className="hbar-in">
        <div className="hbar-text">
          <b>나의 1년 탄소, 아직 모르시나요?</b>
          <span>가입 없이 5분{agg ? ` · ${agg.count.toLocaleString('ko-KR')}명이 계산했어요` : ''}</span>
        </div>
        <button type="button" className="hbar-close" onClick={close}>닫기</button>
        <Link to="/calculator?from=home" className="btn btn-primary btn-md">1.5도 계산기 시작하기</Link>
      </div>
    </div>
  );
}
