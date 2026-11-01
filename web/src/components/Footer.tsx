import { Link } from 'react-router-dom';
import { IGT_URL } from './Logo';

export function Footer() {
  return (
    <footer className="ftr">
      <div className="ftr-in">
        <div className="ftr-brand">
          <Link to="/" className="logo-name ftr-logo">기후시민플랫폼</Link>
          <p>운영: 녹색전환연구소 기후시민팀</p>
          <p>© 2026 Institute for Green Transformation</p>
        </div>
        <nav className="ftr-links" aria-label="바닥 링크">
          <a href={IGT_URL} target="_blank" rel="noopener noreferrer">녹색전환연구소 홈페이지 ↗</a>
          <Link to="/info/terms">이용약관</Link>
          <Link to="/info/privacy" className="ftr-strong">개인정보처리방침</Link>
          <Link to="/info/data">데이터 활용 원칙</Link>
          <Link to="/info/contact">문의하기</Link>
        </nav>
      </div>
    </footer>
  );
}
