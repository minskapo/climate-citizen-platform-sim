import { useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useSim } from '../../lib/sim';
import { K4Region } from './K4Region';
import { K5Campaigns, type AppliedCampaign } from './K5Campaigns';
import { K6Groups } from './K6Groups';
import { K7Done } from './K7Done';
import './onboarding.css';

export type Mode = 'online' | 'offline' | 'signature';
const STEPS = ['지역', '캠페인', '모임'];

export function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="ob-steps" aria-label="진행 단계" style={{ listStyle: 'none', padding: 0 }}>
      {STEPS.map((t, i) => (
        <li key={t} className={i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''}>
          <span className="dot">{i + 1 < step ? '✓' : i + 1}</span>{t}
        </li>
      ))}
    </ol>
  );
}

export function ObFrame({ step, skip, children }: { step?: 1 | 2 | 3; skip?(): void; children: ReactNode }) {
  return (
    <div className="container ob">
      {step && <Stepper step={step} />}
      {skip && <div className="ob-top"><button type="button" className="btn btn-ghost btn-sm" onClick={skip}>건너뛰기</button></div>}
      {children}
    </div>
  );
}

/** 첫 가입 직후 한 번만 보이는 온보딩(K-4 → K-7). 단계마다 건너뛰기는 홈으로. */
export function OnboardingFlow() {
  const sim = useSim();
  const nav = useNavigate();
  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');
  const [modes, setModes] = useState<Mode[]>([]);
  const [applied, setApplied] = useState<AppliedCampaign[]>([]);
  const [joined, setJoined] = useState<string[]>([]);
  if (!sim.userId) return <Navigate to="/signup" replace />;
  const home = () => nav('/');
  return (
    <Routes>
      <Route path="region" element={<K4Region nickname={sim.nickname ?? ''} sido={sido} sigungu={sigungu} modes={modes} onChange={(r) => { setSido(r.sido); setSigungu(r.sigungu); setModes(r.modes); }} onNext={() => nav('/onboarding/campaigns')} onSkip={home} />} />
      <Route path="campaigns" element={<K5Campaigns sido={sido} sigungu={sigungu} modes={modes} applied={applied} onApplied={(a) => setApplied((l) => (l.some((x) => x.id === a.id) ? l : [...l, a]))} onPrev={() => nav('/onboarding/region')} onNext={() => nav('/onboarding/groups')} onSkip={home} />} />
      <Route path="groups" element={<K6Groups sido={sido} applied={applied} onJoined={(n) => setJoined((l) => [...l, n])} onPrev={() => nav('/onboarding/campaigns')} onNext={() => nav('/onboarding/done')} onSkip={home} />} />
      <Route path="done" element={<K7Done applied={applied} joined={joined} />} />
      <Route path="*" element={<Navigate to="/onboarding/region" replace />} />
    </Routes>
  );
}
