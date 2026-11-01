import { Link } from 'react-router-dom';

export function Logo({ sub = true }: { sub?: boolean }) {
  return (
    <Link to="/" className="logo" aria-label="기후시민플랫폼 홈">
      <span className="logo-name">기후시민플랫폼</span>
      {sub && <span className="logo-sub">by 녹색전환연구소</span>}
    </Link>
  );
}

export const IGT_URL = 'https://igt.or.kr';
