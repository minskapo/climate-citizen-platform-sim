import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONFIG } from '@shared/calculator';
import { diffDays, koRange, koShort } from '@shared/date';
import { missionForDate, missionLabel } from '@shared/missions';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { ButtonLink, Chip, LoadError, Spinner } from '../../components/ui';
import { fmt } from '../calculator/BudgetLine';
import { HomeCalcCard } from '../calculator/HomeCalcCard';
import { useFileUrl } from '../../components/useFileUrl';
import { CHECK_LABEL, type RecordsResponse } from '../practice/types';
import { RecordForm } from '../practice/RecordForm';
import { fieldsFor } from '../practice/usePractice';
import { runEndOf, STATUS_LABEL, TYPE_LABEL, type CampaignDetail, type CampaignListItem } from '../campaigns/types';
import { useCalcAggregate, useMeasurements, type CalcAggregate, type MeasurementFull } from './data';
import './home.css';

export const STEPS: Record<string, string[]> = {
  practice: ['계산기로 출발점 재기', '4주 동안 미션 기록', '참가자 게시판에서 인증하기', '끝나면 우리 동네 모임으로'],
  signature: ['요구안 읽어 보기', '이름을 남겨 서명하기', '참가자 게시판에서 소식 보기', '끝나면 우리 동네 모임으로'],
  offline: ['모임 날짜 확인하고 신청하기', '준비물과 안내 확인하기', '현장에서 만나 참여하기', '후기를 나누고 모임으로'],
};
const CHIP = ['계산기', '캠페인', '모임', '모임'];

export const PLATFORM_INTRO = {
  eyebrow: '기후시민플랫폼 소개',
  title: '함께 모이고, 함께 실천하고,\n정책까지 바꾸는 기후시민',
  body: '흩어진 관심을 모임과 캠페인으로 잇습니다.\n우리 동네에서 함께 실천하고, 시민의 요구를 정책으로 전합니다.',
};

const Lines = ({ text }: { text: string }) => <>{text.split('\n').map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>)}</>;

/** 계산기 카드 오른쪽: 누적 수 · 평균 비교. 평균은 3명 미만이면 「아직 집계 중」. */
export function CalcSide({ agg }: { agg: CalcAggregate | null }) {
  return (
    <div className="hcalc">
      <p className="hcalc-live"><span className="hcalc-dot" aria-hidden="true" />실시간 <b>{agg ? agg.count.toLocaleString('ko-KR') : '–'}</b>명이 계산했어요</p>
      <HomeCalcCard />
      <dl className="hcalc-cmp" aria-label="비교">
        <div><dt>참여자 평균</dt><dd>{agg == null ? '–' : agg.avg == null ? '아직 집계 중' : `${fmt(agg.avg)}톤`}</dd></div>
        <div><dt>나</dt><dd>?</dd></div>
        <div><dt>2030 1인당 목표</dt><dd>{fmt(CONFIG.TARGET_2030)}톤</dd></div>
      </dl>
      <p className="hcalc-note">가입 없이 5분 · 질문 28개. 결과는 나중에 저장할 수 있어요.</p>
    </div>
  );
}

function HeroCampaign({ d }: { d: CampaignDetail }) {
  const sim = useSim();
  const c = d.campaign;
  const img = useFileUrl(c.imageFileId);
  const steps = STEPS[c.type] ?? STEPS.practice;
  const s = c.schedule;
  const left = s.recruitEnd && d.status === 'recruiting' ? diffDays(sim.today, s.recruitEnd) : null;
  const meta = [left != null ? (left > 0 ? `마감까지 D-${left}` : '오늘 마감') : null, `${d.counts.participants.toLocaleString('ko-KR')}명 참여`].filter(Boolean).join(' · ');
  const end = runEndOf(c);
  return (
    <div className="hhero-l">
      <div className="hhero-tags">
        <Chip tone="solid" square>{STATUS_LABEL[d.status]}</Chip>
        <Chip tone="gray">{TYPE_LABEL[c.type]}</Chip>
        <span className="hhero-meta">{c.host.name} 캠페인 · {meta}</span>
      </div>
      <h1 className="hhero-title"><Lines text={c.title} /></h1>
      <p className="hhero-lead">{c.summary}</p>
      {img.url && <img className="hhero-img" src={img.url} alt="캠페인 대표 이미지" />}
      <dl className="hhero-facts">
        {s.recruitStart && s.recruitEnd && <div><dt>모집</dt><dd>{koRange(s.recruitStart, s.recruitEnd)}</dd></div>}
        {s.runStart && end && <div><dt>진행</dt><dd>{koRange(s.runStart, end)}{s.runDays ? ` (${s.runDays / 7 % 1 === 0 ? `${s.runDays / 7}주` : `${s.runDays}일`})` : ''}</dd></div>}
        {s.eventDate && <div><dt>모임</dt><dd>{koShort(s.eventDate)}</dd></div>}
        <div><dt>방식</dt><dd>{{ online: '온라인', offline: '오프라인', hybrid: '온라인 + 지역 모임' }[c.settings.mode]}</dd></div>
      </dl>
      <ol className="hhero-steps" aria-label="참여 과정">
        {steps.map((t, i) => (
          <li key={t}><span className="hhero-chip">{CHIP[i]}</span><b>{i + 1}</b><span>{t}</span></li>
        ))}
      </ol>
      <div className="hhero-cta">
        <ButtonLink to={`/campaigns/${c.id}`} size="lg">참여 신청하기</ButtonLink>
        <ButtonLink to={`/campaigns/${c.id}`} size="lg" variant="outline">캠페인 자세히 보기</ButtonLink>
      </div>
    </div>
  );
}

function IntroLeft() {
  return (
    <div className="hhero-l">
      <div className="hhero-tags"><Chip tone="green">{PLATFORM_INTRO.eyebrow}</Chip></div>
      <h1 className="hhero-title"><Lines text={PLATFORM_INTRO.title} /></h1>
      <p className="hhero-lead"><Lines text={PLATFORM_INTRO.body} /></p>
      <div className="hhero-cta">
        <ButtonLink to="/campaigns" size="lg">캠페인 둘러보기</ButtonLink>
        <ButtonLink to="/groups" size="lg" variant="outline">내 주변 모임 찾기</ButtonLink>
      </div>
      <ul className="hhero-trio">
        <li><b>모임</b><span>늘 소통하는 단위</span></li>
        <li><b>캠페인</b><span>기간을 정한 함께하는 실천</span></li>
        <li><b>계산기</b><span>나의 탄소 재기</span></li>
      </ul>
    </div>
  );
}

/** A 비로그인 히어로 */
export function GuestHero() {
  const [hero, setHero] = useState<CampaignDetail | null | undefined>(undefined);
  const [agg] = useCalcAggregate();
  useEffect(() => {
    let alive = true;
    api<{ campaign: CampaignDetail | null }>('/api/campaigns/hero', { quiet: true }).then((r) => alive && setHero(r.campaign)).catch(() => alive && setHero(null));
    return () => { alive = false; };
  }, []);
  return (
    <section className="container hhero" aria-label="히어로">
      <div className="card hhero-card">
        {hero === undefined ? <Spinner /> : hero ? <HeroCampaign d={hero} /> : <IntroLeft />}
      </div>
      <CalcSide agg={agg} />
    </section>
  );
}

/** 지금 달리고 있는 실천 캠페인 참여 */
export function runningPractice(list: CampaignDetail[] | null, today: string): CampaignDetail | null {
  return (list ?? []).find((d) => {
    const c = d.campaign;
    const m = d.myParticipation;
    if (c.type !== 'practice' || !m || m.state !== 'applied' || !c.schedule.runStart) return false;
    const end = runEndOf(c);
    return today >= c.schedule.runStart && !!end && today <= end;
  }) ?? null;
}

export function CarbonCard({ latest, agg, list }: { latest: MeasurementFull | null; agg: CalcAggregate | null; list: MeasurementFull[] }) {
  const policy = latest?.policies?.[0];
  const total = latest?.result.total;
  const first = list.length ? list[list.length - 1] : null;
  return (
    <aside className="hcarbon" aria-label="나의 탄소 기록">
      <div className="hcarbon-top"><h2>나의 탄소 기록</h2><Link to="/me">기록 전체 →</Link></div>
      {latest ? (
        <>
          <p className="hcarbon-total">{fmt(total!)}<small>톤 · {first && first.id === latest.id ? '출발점' : '최근 측정'} ({koShort(latest.simDate).replace(/\(.\)$/, '')})</small></p>
          <dl className="hcalc-cmp hcalc-dark">
            <div><dt>참여자 평균</dt><dd>{agg?.avg != null ? `${fmt(agg.avg)}톤` : '아직 집계 중'}</dd></div>
            <div><dt>나</dt><dd>{fmt(total!)}톤</dd></div>
            <div><dt>2030 1인당 목표</dt><dd>{fmt(CONFIG.TARGET_2030)}톤</dd></div>
          </dl>
          {policy && (
            <div className="hcarbon-policy">
              <small>내가 고른 정책</small>
              <b>{policy}</b>
              <p><strong>{(agg?.policyCounts?.[policy] ?? 0).toLocaleString('ko-KR')}명</strong> 이 같은 정책을 골랐어요</p>
            </div>
          )}
        </>
      ) : (
        <p className="hcarbon-empty">아직 측정한 기록이 없어요. 가입 없이도 5분이면 나의 1년 탄소를 알 수 있어요.</p>
      )}
      <Link to="/calculator" className="btn btn-outline-light btn-md btn-block">{latest ? '다시 계산하기' : '계산하기'}</Link>
    </aside>
  );
}

function RunningLeft({ d }: { d: CampaignDetail }) {
  const sim = useSim();
  const c = d.campaign;
  const mine = d.myParticipation!;
  const s = c.settings;
  const cycle = s.missionCycle ?? 'daily';
  const runStart = c.schedule.runStart!;
  const [rec, setRec] = useState<RecordsResponse | null>(null);
  const [recFailed, setRecFailed] = useState(false);
  const [n, setN] = useState(0);
  const recording = s.recordEnabled !== false;
  useEffect(() => {
    if (!recording) return;
    let alive = true;
    setRecFailed(false);
    api<RecordsResponse>(`/api/participations/${mine.id}/records`, { quiet: true }).then((r) => alive && setRec(r)).catch(() => { if (alive) { setRec(null); setRecFailed(true); } });
    return () => { alive = false; };
  }, [mine.id, recording, sim.today, n]);
  const dayNo = diffDays(runStart, sim.today) + 1;
  const mission = missionForDate(d.missions, cycle, runStart, sim.today, c.schedule.runDays ?? undefined);
  const label = missionLabel(cycle);
  const todayRec = rec?.records.find((x) => x.slotDate === sim.today) ?? null;
  const week = cycle === 'weekly' ? `${Math.floor((dayNo - 1) / 7) + 1}주차 · ` : '';
  const pct = rec && rec.progress.total ? Math.round((rec.progress.done / rec.progress.total) * 100) : 0;
  return (
    <div className="hhero-l">
      <div className="hhero-tags"><Chip tone="navy" square>참여 중</Chip><span className="hhero-meta">{c.title} · {week}{dayNo}일째</span></div>
      <p className="hhero-hello">좋은 하루예요, {sim.nickname} 님</p>
      <h1 className="hhero-title">{mission ? <>{label}:<br />{mission.title}</> : '오늘도 함께해요'}</h1>
      {mission?.description && <p className="hhero-lead">{mission.description}</p>}
      {recording && rec && rec.isSlotToday && (
        todayRec
          ? <p className="hhero-done">오늘은 「{CHECK_LABEL[todayRec.check]}」로 기록했어요.</p>
          : <RecordForm key={sim.today} participationId={mine.id} slotDate={sim.today} fields={fieldsFor(d, sim.today)} numberUnit={s.numberUnit} compact onSaved={() => setN((x) => x + 1)} />
      )}
      {recording && rec && !rec.isSlotToday && <p className="hhero-done">{rec.nextSlot ? `다음 기록일은 ${koShort(rec.nextSlot)}이에요.` : '남은 기록일이 없어요.'}</p>}
      {recording && !rec && (recFailed ? <LoadError text="기록을 불러오지 못했어요" onRetry={() => setN((x) => x + 1)} /> : <Spinner />)}
      {recording && rec && (
        <div className="hhero-prog">
          <div><span>{c.schedule.runDays && c.schedule.runDays % 7 === 0 ? `${c.schedule.runDays / 7}주` : `${c.schedule.runDays}일`} 기록</span><b>{rec.progress.done} / {rec.progress.total}일{rec.progress.streak > 1 ? ` · ${rec.progress.streak}일 연속` : ''}</b></div>
          <div className="cprog-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      <div className="hhero-cta">
        <ButtonLink to={`/campaigns/${c.id}`} size="lg">캠페인으로 가기</ButtonLink>
        <ButtonLink to={`/campaigns/${c.id}`} size="lg" variant="outline">참가자 게시판</ButtonLink>
      </div>
    </div>
  );
}

/** A-2 로그인 히어로 */
export function MemberHero({ suggested, mine, mineFailed, retryMine }: { suggested: CampaignListItem[] | null; mine: CampaignDetail[] | null; mineFailed: boolean; retryMine(): void }) {
  const sim = useSim();
  const [ms] = useMeasurements();
  const [agg] = useCalcAggregate();
  const run = runningPractice(mine, sim.today);
  const latest = ms && ms.length ? ms[0] : null;
  return (
    <section className="container hhero" aria-label="히어로">
      <div className="card hhero-card">
        {mine === null ? (mineFailed ? <LoadError onRetry={retryMine} /> : <Spinner />) : run ? <RunningLeft d={run} /> : (
          <div className="hhero-l">
            <p className="hhero-hello">좋은 하루예요, {sim.nickname} 님</p>
            <h1 className="hhero-title">{latest ? <>나의 1년 탄소는<br />{fmt(latest.result.total)}톤이에요</> : <>나의 1년 탄소,<br />아직 모르시나요?</>}</h1>
            <p className="hhero-lead">{latest ? '캠페인에 참여해 함께 줄여 봐요. 마칠 때 다시 재면 얼마나 줄었는지 알 수 있어요.' : '1.5도 계산기로 출발점을 재 보세요.'}</p>
            <h2 className="hhero-sub">추천하는 캠페인</h2>
            {suggested && suggested.length > 0 ? (
              <ul className="hhero-sug">
                {suggested.slice(0, 2).map((c) => (
                  <li key={c.id}>
                    <Link to={`/campaigns/${c.id}`}><Chip tone="solid" square>{STATUS_LABEL[c.status]}</Chip><b>{c.title}</b><span>{c.summary}</span></Link>
                  </li>
                ))}
              </ul>
            ) : <p className="hhero-lead">지금 열린 캠페인이 없어요.</p>}
            <div className="hhero-cta"><ButtonLink to="/campaigns" size="lg">캠페인 둘러보기</ButtonLink></div>
          </div>
        )}
      </div>
      <CarbonCard latest={latest} agg={agg} list={ms ?? []} />
    </section>
  );
}
