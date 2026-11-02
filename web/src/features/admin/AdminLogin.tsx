import { useState } from 'react';
import { Button, Field } from '../../components/ui';
import { useSim } from '../../lib/sim';
import './admin.css';

/** 관리자 로그인 (체험: 어떤 이메일이든 들어가며 역할을 관리자로 바꾼다). */
export function AdminLogin() {
  const sim = useSim();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr('이메일 주소를 확인해 주세요'); return; }
    sim.setRole('admin');
  };

  return (
    <div className="adm-login">
      <form className="adm-login-card" onSubmit={submit} noValidate>
        <span className="logo-name">기후시민플랫폼</span>
        <h1 className="adm-login-title">관리자 로그인</h1>
        <p className="adm-lead">녹색전환연구소 관리자 계정으로만 들어올 수 있어요.</p>
        <Field label="이메일" error={err}>
          <input className="input" type="email" value={email} placeholder="name@igt.or.kr" autoComplete="username"
            aria-invalid={!!err} onChange={(e) => { setEmail(e.target.value); setErr(null); }} />
        </Field>
        <Field label="비밀번호">
          <input className="input" type="password" value={pw} placeholder="••••••••••" autoComplete="current-password" onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" block>로그인</Button>
        <ul className="adm-login-notes">
          <li>관리자 계정은 기후시민팀이 만들어 드려요.</li>
          <li>체험 사이트에서는 어떤 이메일로도 들어갈 수 있어요.</li>
        </ul>
      </form>
    </div>
  );
}
