import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CONFIG, POLICIES_REDUCE, POLICIES_SOCIAL, QUESTIONS, SECTION_NOTES, SECTOR_KEYS,
  type Answers, type CalcResult, type Question, type SectorKey,
} from '@shared/calculator';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { showToast } from '../../components/Toast';
import { Button } from '../../components/ui';
import { ActionsPicker } from './ActionsPicker';
import { fmt } from './BudgetLine';
import { PolicyPicker } from './PolicyPicker';
import { QuestionView } from './QuestionView';
import { ResultView, type CampaignCtx, type RecCampaign } from './ResultView';
import { SECTOR_NAME, SocialFoundation } from './SocialFoundation';
import { newLocalId, useCalcDraft } from './useCalcDraft';
import './calculator.css';

interface Measurement { id: string; result: CalcResult; policies: string[] }
interface Agg { count: number; avg: number | null; policyCounts?: Record<string, number> }
type Step = { kind: 'intro'; sector: SectorKey } | { kind: 'q'; sector: SectorKey; q: Question; n: number };
type Stage = 'q' | 'result' | 'actions' | 'social' | 'policy' | 'done';

const ALL: Step[] = (() => {
  const out: Step[] = [];
  let n = 0;
  for (const sector of SECTOR_KEYS) {
    out.push({ kind: 'intro', sector });
    for (const q of QUESTIONS[sector]) out.push({ kind: 'q', sector, q, n: ++n });
  }
  return out;
})();
const TOTAL_Q = ALL.filter((s) => s.kind === 'q').length;
const answered = (q: Question, a: Answers) => (q.type === 'one' || q.type === 'yesno' ? a[q.id] !== undefined : true);

export function CalculatorPage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const sim = useSim();
  const draft = useCalcDraft();
  const guest = sim.role === 'guest';

  const from = sp.get('from');
  const campaignId = sp.get('campaignId');
  const kind = campaignId ? ((sp.get('kind') as 'start' | 'end' | null) ?? 'plain') : 'plain';
  const back = sp.get('back');
  const q1 = sp.get('q1');

  const initial = useMemo(() => {
    const answers: Answers = {};
    let idx = 0;
    if (q1 !== null && q1 !== '' && Number.isFinite(Number(q1))) {
      answers[QUESTIONS.food[0].id] = Number(q1);
      idx = ALL.findIndex((s) => s.kind === 'q' && s.n === 2);
    }
    return { answers, idx, carried: Object.keys(answers).length > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [answers, setAnswers] = useState<Answers>(initial.answers);
  const [idx, setIdx] = useState(initial.idx);
  const [carried, setCarried] = useState(initial.carried);
  const [stage, setStage] = useState<Stage>('q');
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<Measurement | null>(null);
  const [agg, setAgg] = useState<Agg | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [social, setSocial] = useState<string[]>([]);
  const [policies, setPolicies] = useState<string[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [startTotal, setStartTotal] = useState<number | null>(null);
  const [rec, setRec] = useState<RecCampaign | null>(null);
  const localId = useRef(newLocalId());

  // 캠페인 이름 · 출발점 측정값
  useEffect(() => {
    if (!campaignId) return;
    let off = false;
    (async () => {
      try {
        const r = await api<{ campaign: { title: string }; myParticipation?: { startMeasurementId: string | null } | null }>(`/api/campaigns/${campaignId}`, { quiet: true });
        if (off) return;
        setTitle(r.campaign.title);
        const sid = r.myParticipation?.startMeasurementId;
        if (kind === 'end' && sid) {
          const list = await api<{ items: Array<{ id: string; result: { total: number } }> }>('/api/me/measurements', { quiet: true });
          const s = list.items.find((x) => x.id === sid);
          if (!off && s) setStartTotal(s.result.total);
        }
      } catch { /* 이름을 못 불러와도 계산은 계속한다 */ }
    })();
    return () => { off = true; };
  }, [campaignId, kind]);

  const campaignPath = back ?? (campaignId ? `/campaigns/${campaignId}` : null);
  const goBack = () => (back ? nav(back) : campaignPath && campaignId ? nav(campaignPath) : nav(-1));
  const backLabel = campaignId ? `← ${title ?? '캠페인'}로 돌아가기` : '← 이전 화면';

  const step = ALL[idx];
  const setAns = (id: string, v: Answers[string]) => setAnswers((a) => ({ ...a, [id]: v }));
  const loadRec = async (total: number, result: CalcResult) => {
    try {
      let list: Array<RecCampaign & { summary?: string }> = [];
      for (const status of ['recruiting', 'scheduled']) {
        const r = await api<{ items: Array<RecCampaign & { summary?: string }> }>(`/api/campaigns?status=${status}`, { quiet: true });
        list = list.concat(r.items.map((x) => ({ ...x, status })));
      }
      void total;
      const top = SECTOR_NAME[SECTOR_KEYS.map((k) => [k, result.sectors[k]] as const).sort((a, b) => b[1] - a[1])[0][0]];
      const hit = list.find((c) => `${c.title} ${c.summary ?? ''}`.includes(top));
      setRec(hit ?? list[0] ?? null);
    } catch { setRec(null); }
  };
  const refreshAgg = () => api<Agg>('/api/aggregates/calculator', { quiet: true }).then(setAgg).catch(() => undefined);

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        answers,
        place: campaignId ? 'campaign' : from === 'home' ? 'home' : 'menu',
      };
      if (campaignId) { body.campaignId = campaignId; body.kind = kind; }
      if (guest) body.localId = localId.current;
      const r = await api<{ measurement: Measurement }>('/api/measurements', { body });
      if (guest) draft.remember(localId.current);
      setM(r.measurement);
      setStage('result');
      refreshAgg();
      loadRec(r.measurement.result.total, r.measurement.result);
      window.scrollTo?.(0, 0);
    } catch {
      showToast('저장하지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  const putChoices = async (choices: Record<string, unknown>) => {
    if (!m) return false;
    setBusy(true);
    try {
      await api(`/api/measurements/${m.id}/choices`, { method: 'POST', body: guest ? { ...choices, localId: localId.current } : choices });
      return true;
    } catch {
      showToast('저장하지 못했어요. 다시 시도해 주세요');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    localId.current = newLocalId();
    setM(null); setPicked([]); setSocial([]); setPolicies([]); setStage('q');
    setIdx(ALL.findIndex((s) => s.kind === 'q'));
  };

  const over = !!m && m.result.total > CONFIG.TARGET_2030;
  const campaignCtx: CampaignCtx | null = campaignId ? { title, kind, startTotal, backPath: campaignPath ?? '/' } : null;
  const leaveToHome = () => (campaignId ? goBack() : nav(guest ? (back ?? '/') : '/me'));

  let content;
  if (stage === 'q') {
    const qn = step.kind === 'q' ? step.n : ALL.slice(0, idx).filter((s) => s.kind === 'q').length + 1;
    const remain = Math.max(1, Math.ceil((TOTAL_Q - qn + 1) / 5));
    const isLast = idx === ALL.length - 1;
    const sectorOf = step.sector;
    content = (
      <div className="calc-wrap">
        <div className="calc-card">
          <div className="calc-prog"><span>{SECTOR_NAME[sectorOf]} · {qn} / {TOTAL_Q}</span><span>약 {remain}분 남음</span></div>
          <div className="calc-bar"><i style={{ width: `${(qn / TOTAL_Q) * 100}%` }} /></div>
          {guest && <p className="calc-help" style={{ margin: '0 0 var(--s-3)' }}>가입 없이 · 결과는 가입 후 저장</p>}
          {step.kind === 'intro' ? (
            <div>
              <h2 className="calc-q">{SECTOR_NAME[step.sector]}</h2>
              <p className="calc-intro-n">{QUESTIONS[step.sector].length}개 문항이에요.{SECTION_NOTES[step.sector] ? ` ${SECTION_NOTES[step.sector]}` : ''}</p>
              {SECTION_NOTES[step.sector] && <p className="calc-note">{SECTION_NOTES[step.sector]}</p>}
              <div className="calc-nav sticky">
                <Button variant="outline" size="lg" pill onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>이전</Button>
                <Button size="lg" pill onClick={() => setIdx(idx + 1)}>시작하기</Button>
              </div>
            </div>
          ) : (
            <div>
              {carried && step.n === 2 && (
                <div className="calc-carry">
                  <span aria-hidden="true">✓</span>
                  1번 답 「{answers[QUESTIONS.food[0].id] as number}{QUESTIONS.food[0].unit}」은 홈에서 고른 답을 이어받았어요
                  <button type="button" onClick={() => { setCarried(false); setIdx(ALL.findIndex((s) => s.kind === 'q' && s.n === 1)); }}>바꾸기</button>
                </div>
              )}
              <QuestionView key={step.q.id} q={step.q} answers={answers} onChange={setAns} />
              <div className="calc-nav sticky">
                <Button variant="outline" size="lg" pill onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>이전</Button>
                <Button size="lg" pill disabled={!answered(step.q, answers) || busy}
                  onClick={() => (isLast ? save() : setIdx(idx + 1))}>{isLast ? '결과 보기' : '다음'}</Button>
              </div>
            </div>
          )}
        </div>
        <p className="calc-foot-note">결과 화면에서 「나의 탄소 기록에 저장」을 누르면 플랫폼이 저장해요. 비회원은 이 브라우저에 임시 보관했다가 가입하면 옮겨져요.</p>
      </div>
    );
  } else if (stage === 'result' && m) {
    content = (
      <div className="calc-wrap is-wide">
        <ResultView
          result={m.result} avg={agg?.avg ?? null} guest={guest} campaign={campaignCtx} rec={rec} policies={policies} policyCounts={agg?.policyCounts}
          onContinue={() => setStage(over ? 'actions' : 'social')}
          onRetry={restart} onLeave={leaveToHome}
          onSignup={(via) => nav(via ? `/signup?via=${via}` : '/signup')}
        />
      </div>
    );
  } else if (stage === 'actions' && m) {
    content = (
      <div className="calc-wrap"><div className="calc-card">
        <ActionsPicker result={{ ...m.result, ans: answers } as CalcResult} selected={picked} onChange={setPicked} busy={busy}
          onNext={async () => { if (await putChoices({ actions: picked })) setStage('policy'); }} />
      </div></div>
    );
  } else if (stage === 'social' && m) {
    content = (
      <div className="calc-wrap"><div className="calc-card">
        <SocialFoundation selected={social} onChange={setSocial} busy={busy}
          onNext={async () => { if (await putChoices({ social })) setStage('policy'); }} />
      </div></div>
    );
  } else if (stage === 'policy' && m) {
    content = (
      <div className="calc-wrap"><div className="calc-card">
        <PolicyPicker list={over ? POLICIES_REDUCE : POLICIES_SOCIAL} selected={policies} onChange={setPolicies} busy={busy}
          onDone={async () => {
            if (await putChoices({ policies })) {
              setStage('done');
              if (!guest) refreshAgg();
            }
          }} />
      </div></div>
    );
  } else {
    content = (
      <div className="calc-wrap"><div className="calc-card">
        <h2 className="calc-q">고마워요, 다 마쳤어요</h2>
        <p className="calc-help">나의 1년 탄소배출량은 {fmt(m?.result.total ?? 0)}톤이에요.</p>
        {policies.length > 0 && (
          <div className="calc-note">
            <b>내가 고른 정책</b>
            {policies.map((p) => (
              <div key={p}>
                {p} ·{' '}
                {guest ? '같은 정책을 고른 시민 수는 가입하면 볼 수 있어요' : `같은 정책을 고른 시민 ${(agg?.policyCounts?.[p] ?? 0).toLocaleString('ko-KR')}명`}
              </div>
            ))}
          </div>
        )}
        <div className="calc-nav">
          <Button variant="outline" size="lg" pill onClick={restart}>다시 계산하기</Button>
          <Button size="lg" pill onClick={leaveToHome}>{campaignId ? '캠페인으로 돌아가기' : guest ? '나가기' : '내 활동 보기'}</Button>
        </div>
      </div></div>
    );
  }

  return (
    <div className="calc-page">
      <div className={`calc-top${campaignId ? ' is-campaign' : ''}`}>
        <div className="calc-top-in">
          <button type="button" className="calc-back" onClick={goBack}>{backLabel}</button>
          {campaignId && kind !== 'plain' && (
            <>
              <span className="calc-top-tag">{kind === 'end' ? '마무리 측정 중' : '출발점 측정 중'}</span>
              <span className="calc-top-note">결과는 캠페인과 나의 탄소 기록에 함께 저장돼요</span>
            </>
          )}
        </div>
      </div>
      {content}
    </div>
  );
}
