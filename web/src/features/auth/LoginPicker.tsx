import { Link, useNavigate } from 'react-router-dom';
import { NicknameList, type UserLite } from '../../components/NicknamePicker';
import { showToast } from '../../components/Toast';
import { useSim } from '../../lib/sim';
import './auth.css';

/** 로그인: 이미 만든 활동명을 찾아 고른다(비밀번호 없음). 온보딩은 보이지 않는다. */
export function LoginPicker() {
  const sim = useSim();
  const nav = useNavigate();
  const pick = (u: UserLite) => {
    sim.setUser(u.id, u.nickname);
    if (sim.role === 'guest') sim.setRole('member');
    showToast(`${u.nickname} 님으로 들어왔어요`);
    nav('/');
  };
  return (
    <div className="container auth-narrow">
      <h1>로그인</h1>
      <p className="auth-lead">이미 만든 활동명을 골라 들어가요. 체험용이라 비밀번호는 없어요.</p>
      <NicknameList onPick={pick} currentId={sim.userId} />
      <p className="auth-foot" style={{ marginTop: 24 }}>처음이신가요?<Link to="/signup">가입하기</Link></p>
    </div>
  );
}
