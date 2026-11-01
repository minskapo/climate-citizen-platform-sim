import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSim } from '../lib/sim';
import { useUnreadNotifications } from '../lib/notifications';
import { IGT_URL, Logo } from './Logo';

const NAV = [
  { to: '/', label: '홈', end: true },
  { to: '/campaigns', label: '캠페인' },
  { to: '/groups', label: '모임' },
  { to: '/me', label: '내 활동' },
  { to: '/about', label: '소개' },
];

export const NOTIFICATIONS_PATH = '/me?tab=notifications';

export function Header() {
  const { role, nickname, userId } = useSim();
  const unread = useUnreadNotifications();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const signedIn = role !== 'guest' && !!userId;

  const account = signedIn ? (
    <>
      <Link to={NOTIFICATIONS_PATH} className="hdr-link hdr-alarm">
        알림{unread > 0 && <span className="hdr-badge">{unread > 99 ? '99+' : unread}</span>}
      </Link>
      <Link to="/me" className="hdr-link hdr-me">{nickname ?? '회원'} 님</Link>
    </>
  ) : (
    <>
      <Link to="/login" className="hdr-link">로그인</Link>
      <Link to="/signup" className="btn btn-primary btn-md">가입하기</Link>
    </>
  );

  return (
    <header className="hdr">
      <div className="hdr-in">
        <Logo />
        <nav className="hdr-nav" aria-label="주 메뉴">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `hdr-nav-a${isActive ? ' is-active' : ''}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hdr-right">
          <a className="hdr-ext" href={IGT_URL} target="_blank" rel="noopener noreferrer">녹색전환연구소 홈페이지 ↗</a>
          <Link to="/calculator" className="btn btn-tint btn-md hdr-calc">1.5도 계산기</Link>
          <div className="hdr-account">{account}</div>
          <button
            type="button"
            className="hdr-menu"
            aria-expanded={open}
            aria-controls="hdr-drawer"
            aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              {open ? <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
            </svg>
            {signedIn && unread > 0 && !open && <span className="hdr-dot" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <div id="hdr-drawer" className="hdr-drawer">
          <nav aria-label="모바일 메뉴">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `hdr-drawer-a${isActive ? ' is-active' : ''}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="hdr-drawer-account">{account}</div>
          <a className="hdr-ext" href={IGT_URL} target="_blank" rel="noopener noreferrer">녹색전환연구소 홈페이지 ↗</a>
        </div>
      )}
    </header>
  );
}
