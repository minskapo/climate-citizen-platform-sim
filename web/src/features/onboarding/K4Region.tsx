import { useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui';
import { SIDO_LIST } from '../auth/regions';
import { ObFrame, Stepper, type Mode } from './OnboardingFlow';

const CHOICES: Array<{ id: Mode; title: string; text: string }> = [
  { id: 'online', title: '온라인에서', text: '집에서 기록하고 게시판에서 나눠요.' },
  { id: 'offline', title: '동네에서 만나서', text: '가까운 곳에서 직접 모여 실천해요.' },
  { id: 'signature', title: '서명으로 목소리 내기', text: '정책 요구에 이름을 보태요.' },
];

/** K-4 온보딩 1/3 · 지역과 참여 방식 */
export function K4Region({ nickname, sido, sigungu, modes, onChange, onNext, onSkip }: {
  nickname: string; sido: string; sigungu: string; modes: Mode[];
  onChange(r: { sido: string; sigungu: string; modes: Mode[] }): void; onNext(): void; onSkip(): void;
}) {
  const [busy, setBusy] = useState(false);
  const next = async () => {
    if (busy) return;
    setBusy(true);
    if (sido) {
      try { await api('/api/me', { method: 'PATCH', body: { sido, sigungu: sigungu.trim() }, quiet: true }); } catch { /* 저장하지 못해도 이어 간다 */ }
    }
    setBusy(false);
    onNext();
  };
  const toggle = (m: Mode) => onChange({ sido, sigungu, modes: modes.includes(m) ? modes.filter((x) => x !== m) : [...modes, m] });
  return (
    <ObFrame skip={onSkip}>
      <Stepper step={1} />
      <p className="ob-banner">✓ 가입했어요. 계산 결과는 내 활동에 저장돼 있어요.</p>
      <h1>반가워요, {nickname} 님!</h1>
      <p className="ob-lead">딱 맞는 캠페인과 모임을 찾기 위해 두 가지만 물어볼게요.</p>
      <div className="ob-sec">
        <strong>어디에서 활동하세요?</strong>
        <div className="ob-row">
          <select className="input" aria-label="시·도" value={sido} onChange={(e) => onChange({ sido: e.target.value, sigungu: '', modes })}>
            <option value="">시·도 선택</option>
            {SIDO_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="input" aria-label="시·군·구" placeholder="시·군·구 입력" value={sigungu} disabled={!sido} onChange={(e) => onChange({ sido, sigungu: e.target.value, modes })} />
        </div>
      </div>
      <div className="ob-sec">
        <strong>어떻게 함께하고 싶으세요? (여러 개 고를 수 있어요)</strong>
        {CHOICES.map((c) => (
          <label key={c.id} className={`ob-choice${modes.includes(c.id) ? ' on' : ''}`}>
            <input type="checkbox" checked={modes.includes(c.id)} onChange={() => toggle(c.id)} />
            <span><strong>{c.title}</strong><small>{c.text}</small></span>
          </label>
        ))}
      </div>
      <div className="ob-nav"><span /><Button size="lg" onClick={next} disabled={busy}>다음</Button></div>
    </ObFrame>
  );
}
