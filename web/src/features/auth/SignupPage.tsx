import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { normalizeNickname } from '@shared/validate';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { Button, Field } from '../../components/ui';
import { SIDO_LIST } from './regions';
import './auth.css';

const CONSENTS = [
  { key: 'terms', label: '[필수] 이용약관', required: true, to: '/info/terms' },
  { key: 'privacy', label: '[필수] 개인정보 수집·이용', required: true, to: '/info/privacy' },
  { key: 'research', label: '[선택] 내 기록을 익명 집계로 연구에 활용', required: false, to: '/info/data' },
  { key: 'news', label: '[선택] 새 캠페인 소식 이메일로 받기', required: false, to: '/info/privacy' },
] as const;

/** 가입(I). 카카오 · 네이버 · Google · 이메일 어느 쪽이든 같은 간단 가입으로 이어진다. */
export function SignupPage() {
  const sim = useSim();
  const nav = useNavigate();
  const nickRef = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState('');
  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(false);

  const allOn = CONSENTS.every((c) => consent[c.key]);
  const requiredOk = CONSENTS.filter((c) => c.required).every((c) => consent[c.key]);
  const toggleAll = (on: boolean) => setConsent(Object.fromEntries(CONSENTS.map((c) => [c.key, on])));
  const social = () => { setNote(true); nickRef.current?.focus(); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const n = normalizeNickname(nickname);
    if (!n.ok) { setError(n.error); return; }
    if (!requiredOk) { setError('필수 항목에 동의해 주세요'); return; }
    setBusy(true);
    setError(null);
    try {
      const user = await api<{ id: string; nickname: string }>('/api/users', {
        body: { nickname: n.value, sido, sigungu: sido ? sigungu.trim() : '', consents: consent },
        quiet: true,
      });
      sim.setUser(user.id, user.nickname);
      if (sim.role === 'guest') sim.setRole('member');
      const ids = sim.pendingMeasurementIds;
      if (ids.length) {
        try { await api('/api/measurements/claim', { body: { localIds: ids }, quiet: true }); } catch { /* 옮기지 못해도 가입은 끝났다 */ }
        sim.setPendingMeasurementIds([]);
      }
      nav('/onboarding/region');
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === 'NICKNAME_TAKEN' ? '이미 쓰는 활동명이에요' : (err as Error).message || '가입하지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container auth">
      <div className="auth-intro">
        <h1>기후시민플랫폼에<br />가입하기</h1>
        <p className="auth-lead">가입하면 계산 결과를 저장하고, 캠페인과 모임에 참여할 수 있어요.</p>
        {sim.pendingMeasurementIds.length > 0 && (
          <div className="auth-saved"><div><small>방금 계산한 결과</small><strong>나의 1년 탄소</strong></div><span>가입하면 자동 저장</span></div>
        )}
        <ol className="auth-steps">
          <li><b>1</b><div><strong>결과 저장과 다시 재기</strong><p>언제든 다시 재서 지난 결과와 비교할 수 있어요.</p></div></li>
          <li><b>2</b><div><strong>우리 동네 캠페인과 모임</strong><p>사는 지역에 맞는 캠페인과 모임을 먼저 알려 드려요.</p></div></li>
          <li><b>3</b><div><strong>같은 정책을 고른 시민</strong><p>나와 같은 정책을 고른 시민이 몇 명인지 볼 수 있어요.</p></div></li>
        </ol>
        <div className="auth-old"><strong>기존 기후시민플랫폼 회원인가요?</strong><p>새로 가입하지 않아도 돼요. 쓰던 이메일로 로그인하면 계정이 옮겨져 있어요.</p></div>
      </div>

      <form className="auth-card" onSubmit={submit} noValidate>
        <h2>간편하게 시작하기</h2>
        <div className="auth-social">
          <Button size="lg" block className="btn-kakao" onClick={social}>카카오로 시작하기</Button>
          <Button size="lg" block className="btn-naver" onClick={social}>네이버로 시작하기</Button>
          <Button size="lg" block variant="outline" onClick={social}>Google로 시작하기</Button>
        </div>
        {note && <p className="field-hint" role="status">체험판이라 어느 쪽이든 아래 활동명만 정하면 가입돼요.</p>}
        <div className="auth-or">또는 이메일로 가입</div>
        <Field label="이메일" hint="체험판에서는 비워 두어도 돼요."><input className="input" type="email" placeholder="name@example.com" autoComplete="off" /></Field>
        <Field label="비밀번호"><input className="input" type="password" placeholder="8자 이상, 영문과 숫자 포함" autoComplete="new-password" /></Field>
        <Field label="활동명" hint="실명이 아니어도 돼요. 나중에 바꿀 수 있어요." error={error}>
          <input ref={nickRef} aria-label="활동명" className="input" value={nickname} placeholder="게시판과 캠페인에 보이는 이름이에요" maxLength={30} aria-invalid={!!error} onChange={(e) => { setNickname(e.target.value); setError(null); }} />
        </Field>
        <div className="field">
          <span className="field-label">사는 지역 (선택)</span>
          <div className="auth-row">
            <select className="input" aria-label="시·도" value={sido} onChange={(e) => setSido(e.target.value)}>
              <option value="">시·도 선택</option>
              {SIDO_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="input" aria-label="시·군·구" placeholder="시·군·구 입력" value={sigungu} disabled={!sido} onChange={(e) => setSigungu(e.target.value)} />
          </div>
          <span className="field-hint">우리 동네 캠페인과 모임을 추천하는 데에만 써요.</span>
        </div>
        <div className="auth-consent">
          <label className="all"><input type="checkbox" checked={allOn} onChange={(e) => toggleAll(e.target.checked)} />전체 동의</label>
          {CONSENTS.map((c) => (
            <div className="row" key={c.key}>
              <label><input type="checkbox" checked={!!consent[c.key]} onChange={(e) => setConsent({ ...consent, [c.key]: e.target.checked })} />{c.label}</label>
              <Link to={c.to}>보기</Link>
            </div>
          ))}
        </div>
        <Button type="submit" size="lg" block disabled={busy || !requiredOk || !nickname.trim()}>가입하기</Button>
        <p className="auth-foot">이미 계정이 있나요?<Link to="/login">로그인</Link></p>
      </form>
    </div>
  );
}
