import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Footer } from './Footer';
import { Header } from './Header';
import { SimBar } from './SimBar';

function useScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}

/** 플랫폼 화면: 체험 도구 막대 · 헤더 · 본문 · 푸터 */
export function PlatformLayout() {
  useScrollTop();
  return (
    <div className="app">
      <SimBar />
      <Header />
      <main className="main" id="main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

/** 관리자 화면 등 플랫폼 헤더 · 푸터가 없는 화면: 체험 도구 막대만 둔다. */
export function BareLayout() {
  useScrollTop();
  return (
    <div className="app">
      <SimBar />
      <Outlet />
    </div>
  );
}
