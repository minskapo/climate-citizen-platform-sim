import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { AdminLogin } from './AdminLogin';
import './admin.css';

const CrumbContext = createContext<(c: string[]) => void>(() => undefined);

/** 관리자 화면 위 경로(관리자 › …)를 정한다. 레이아웃 밖(테스트)에서는 아무 일도 하지 않는다. */
export function useAdminCrumbs(crumbs: string[]) {
  const set = useContext(CrumbContext);
  const key = crumbs.join('\u0000');
  useEffect(() => {
    set(key.split('\u0000'));
  }, [key, set]);
}

interface Counts { reports: number; collab: number }

const MENU: Array<{ to: string; label: string; end?: boolean; count?: keyof Counts }> = [
  { to: '/admin', label: '관리자 홈', end: true },
  { to: '/admin/campaigns', label: '캠페인' },
  { to: '/admin/tools', label: '웹 도구' },
  { to: '/admin/groups', label: '모임' },
  { to: '/admin/reports', label: '신고', count: 'reports' },
  { to: '/admin/collab', label: '협업 제안', count: 'collab' },
  { to: '/admin/users', label: '회원' },
  { to: '/admin/data', label: '데이터 · 통계' },
];

/** 관리자 화면 틀: 왼쪽 메뉴 · 위 경로 · 플랫폼으로 가기. 관리자가 아니면 로그인 화면. */
export function AdminLayout() {
  const sim = useSim();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [crumbs, setCrumbs] = useState<string[]>([]);
  const [counts, setCounts] = useState<Counts>({ reports: 0, collab: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const setStable = useCallback((c: string[]) => setCrumbs(c), []);
  const isAdmin = sim.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    api<{ tasks: { openReports: number; openCollab: unknown[] } }>('/api/admin/home', { quiet: true })
      .then((r) => setCounts({ reports: r.tasks.openReports, collab: r.tasks.openCollab.length }))
      .catch(() => undefined);
  }, [isAdmin, pathname]);

  useEffect(() => setMenuOpen(false), [pathname]);

  if (!isAdmin) return <AdminLogin />;

  const toPlatform = () => {
    sim.setRole(sim.userId ? 'member' : 'guest');
    navigate('/');
  };

  return (
    <CrumbContext.Provider value={setStable}>
      <div className="adm">
        <aside className={`adm-side${menuOpen ? ' is-open' : ''}`}>
          <div className="adm-brand">
            <span className="logo-name">기후시민플랫폼</span>
            <span className="logo-sub">관리자 · 녹색전환연구소</span>
            <button type="button" className="adm-menu-btn" aria-expanded={menuOpen} aria-label="관리자 메뉴" onClick={() => setMenuOpen((v) => !v)}>☰</button>
          </div>
          <nav className="adm-nav" aria-label="관리자 메뉴">
            {MENU.map((m) => (
              <NavLink key={m.to} to={m.to} end={m.end} className={({ isActive }) => `adm-nav-a${isActive ? ' is-active' : ''}`}>
                <span>{m.label}</span>
                {m.count && counts[m.count] > 0 && <span className="adm-badge">{counts[m.count]}</span>}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="adm-body">
          <div className="adm-top">
            <nav className="adm-crumbs" aria-label="현재 위치">
              {['관리자', ...crumbs].map((c, i) => (
                <span key={`${c}-${i}`}>{i > 0 && <span className="adm-crumb-sep" aria-hidden="true">›</span>}{c}</span>
              ))}
            </nav>
            <button type="button" className="adm-top-link" onClick={toPlatform}>플랫폼으로 가기 ↗</button>
            {sim.nickname && <span className="adm-me">{sim.nickname} · 기후시민팀</span>}
          </div>
          <main className="adm-main">
            <Outlet />
          </main>
        </div>
      </div>
    </CrumbContext.Provider>
  );
}

/** Task 21에서 채울 관리자 메뉴 자리 */
export function AdminPlaceholder({ title }: { title: string }) {
  useAdminCrumbs([title]);
  return (
    <div>
      <h1 className="adm-title">{title}</h1>
      <p className="adm-lead">이 메뉴는 곧 열려요.</p>
    </div>
  );
}
