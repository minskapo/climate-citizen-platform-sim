import { useState, type FormEvent } from 'react';
import { ApiError, enter } from '../../lib/api';

/** 입장 화면: 공용 입장 암호를 넣으면 토큰을 받아 30일 동안 브라우저에 보관한다. */
export function EnterGate() {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return setError('입장 암호를 입력해 주세요');
    setBusy(true);
    setError(null);
    try {
      await enter(passcode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '입장하지 못했어요. 다시 시도해 주세요');
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit} noValidate>
        <span className="logo-name gate-logo">기후시민플랫폼</span>
        <span className="chip chip-gray gate-chip">체험판</span>
        <h1 className="gate-title">입장 암호를 입력해 주세요</h1>
        <p className="gate-text">녹색전환연구소 팀원과 파트너만 들어올 수 있는 체험 사이트예요. 안내받은 암호를 넣어 주세요.</p>
        <label className="field">
          <span className="field-label">입장 암호</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={passcode}
            aria-invalid={!!error}
            onChange={(e) => setPasscode(e.target.value)}
          />
          {error && <span className="field-error" role="alert">{error}</span>}
        </label>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? '확인하는 중…' : '들어가기'}</button>
        <p className="gate-foot">한 번 들어오면 이 브라우저에서 30일 동안 다시 묻지 않아요.</p>
      </form>
    </div>
  );
}
