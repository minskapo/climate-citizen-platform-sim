import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { koLong, koShort } from '@shared/date';
import { api } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { Button, EmptyState, Field } from '../../components/ui';
import './apply.css';

export interface ApplyResult { participationId: string; waitlisted: boolean }
export interface ApplySheetProps {
  campaignId: string;
  /** detail: 완료 후 캠페인 상세의 완료 화면으로 · elsewhere: 그 자리에 머물고 토스트 */
  origin: 'detail' | 'elsewhere';
  onDone(result: ApplyResult): void;
  onClose(): void;
  /** 서명 공유 링크(?ref=)를 타고 온 경우, 링크를 공유한 사람의 id */
  sharedBy?: string | null;
}

interface Settings {
  hostLink?: 'linked' | 'none';
  startPoint?: { enabled: boolean; toolId: string };
  reminderTime?: string;
  demandSummary?: string;
  fields?: string[];
  hostJoin?: 'ask' | 'auto' | 'none';
  deliveryTarget?: string;
  waitlist?: boolean;
  askCompanions?: boolean;
  askTransport?: boolean;
  photoConsent?: boolean;
  capacity?: number | null;
}
interface Detail {
  campaign: {
    id: string; type: 'practice' | 'signature' | 'offline'; title: string;
    host: { type: 'group' | 'igt'; id?: string; name: string }; hostGroupId: string | null;
    schedule: { runStart?: string; runDays?: number; eventDate?: string; eventStart?: string; eventEnd?: string; deliveryDate?: string };
    settings: Settings;
  };
  counts: { seatsLeft: number | null; waitlisted: number };
  myParticipation: { state: string } | null;
}
interface Measurement { id: string; simDate: string; result: { total: number } }
interface Me { nickname: string; sido: string; sigungu: string }

const TRANSPORTS = ['대중교통', '자전거 · 걷기', '자동차', '그 밖'];
const MAX_COMPANIONS = 5;
const CAMPAIGN_DONE = (t: string) => (t === 'signature' ? '서명했어요' : '신청했어요 · 내 활동에서 볼 수 있어요');

/** 공통 신청 창(H-1 · S-1 · O-1). 어디서 열든 같은 창이 지금 화면 위에 뜬다. */
export function ApplySheet({ campaignId, origin, onDone, onClose, sharedBy }: ApplySheetProps) {
  const sim = useSim();
  const nav = useNavigate();
  const loggedIn = !!sim.userId && sim.role !== 'guest';
  const [d, setD] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [ms, setMs] = useState<Measurement[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 입력 상태
  const [start, setStart] = useState<'saved' | 'later'>('saved');
  const [startId, setStartId] = useState('');
  const [remind, setRemind] = useState(true);
  const [channel, setChannel] = useState<'push' | 'email'>('push');
  const [time, setTime] = useState('20:00');
  const [hostOk, setHostOk] = useState(true);
  const [research, setResearch] = useState(false);
  const [delivery, setDelivery] = useState(true);
  const [joinHost, setJoinHost] = useState(false);
  const [realname, setRealname] = useState('');
  const [opinion, setOpinion] = useState('');
  const [companions, setCompanions] = useState(0);
  const [transport, setTransport] = useState('');
  const [photo, setPhoto] = useState(false);

  useEffect(() => {
    let alive = true;
    api<Detail>(`/api/campaigns/${campaignId}`, { quiet: true })
      .then((r) => { if (alive) { setD(r); setTime(r.campaign.settings.reminderTime ?? '20:00'); } })
      .catch(() => alive && setFailed(true));
    if (loggedIn) {
      api<Me>('/api/me', { quiet: true }).then((r) => alive && setMe(r)).catch(() => undefined);
      api<{ items: Measurement[] }>('/api/me/measurements', { quiet: true })
        .then((r) => { if (alive) { setMs(r.items ?? []); setStartId(r.items?.[0]?.id ?? ''); if (!r.items?.length) setStart('later'); } })
        .catch(() => alive && setStart('later'));
    }
    return () => { alive = false; };
  }, [campaignId, loggedIn]);

  const c = d?.campaign;
  const s = c?.settings ?? {};
  const host = c?.hostGroupId ? c.host.name : null;
  const seatsLeft = d?.counts.seatsLeft ?? null;
  const full = c?.type === 'offline' && seatsLeft === 0;
  const waitMode = full && !!s.waitlist;
  const maxComp = full ? MAX_COMPANIONS : seatsLeft == null ? MAX_COMPANIONS : Math.max(0, Math.min(MAX_COMPANIONS, seatsLeft - 1));
  const hostRequired = c?.type !== 'signature' && !!host;

  const submit = async () => {
    if (!c || busy) return;
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { answers: {}, consents: {} };
    const consents: Record<string, boolean> = {};
    if (c.type === 'practice') {
      if (host) consents.host = hostOk;
      consents.research = research;
      body.reminder = { enabled: remind, time, channel };
      if (s.startPoint?.enabled && start === 'saved' && startId) body.startMeasurementId = startId;
    } else if (c.type === 'signature') {
      consents.delivery = delivery;
      const answers: Record<string, string> = {};
      if (me?.sido) answers.region = me.sido;
      if (s.fields?.includes('realname') && realname.trim()) answers.realname = realname.trim();
      if (s.fields?.includes('opinion') && opinion.trim()) answers.opinion = opinion.trim();
      body.answers = answers;
      if (s.hostJoin === 'ask' && host) body.joinHost = joinHost;
      if (sharedBy && sharedBy !== sim.userId) body.sharedBy = sharedBy;
    } else {
      if (host) consents.host = hostOk;
      if (s.photoConsent) consents.photo = photo;
      if (s.askCompanions) body.companions = companions;
      if (s.askTransport && transport) body.transport = transport;
    }
    body.consents = consents;
    try {
      const r = await api<{ participation: { id: string; signatureNo?: number | null; waitlistNo?: number | null }; waitlisted: boolean }>(
        `/api/campaigns/${campaignId}/participate`, { body, quiet: true });
      const p = r.participation;
      showToast(r.waitlisted ? `대기 ${p.waitlistNo}번으로 신청했어요` : c.type === 'signature' && p.signatureNo ? `서명했어요 · ${p.signatureNo.toLocaleString('ko-KR')}번째 서명이에요` : CAMPAIGN_DONE(c.type));
      onDone({ participationId: p.id, waitlisted: r.waitlisted });
      if (origin === 'detail') {
        if (c.type === 'practice' && s.startPoint?.enabled && start === 'later') {
          nav(`/calculator?from=campaign&campaignId=${campaignId}&kind=start`);
        } else {
          nav(`/campaigns/${campaignId}`, { state: { completed: true, waitlisted: r.waitlisted } });
        }
      }
      onClose();
    } catch (e) {
      setError((e as Error).message || '신청하지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  const title = c?.type === 'signature' ? '서명하기' : '참여 신청';
  const needHost = c?.type === 'practice' || c?.type === 'offline' ? !host || hostOk : true;
  const disabled = busy || !c || !loggedIn || !needHost || (c.type === 'signature' && !delivery) || (full && !s.waitlist) || d?.myParticipation?.state === 'applied';
  const cta = c?.type === 'signature' ? '서명하기' : waitMode ? '대기 신청하기' : full ? '자리가 모두 찼어요' : c?.type === 'offline' ? '신청 완료하기' : '참여 신청 완료하기';

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={<><Button variant="outline" pill onClick={onClose}>취소</Button><Button pill onClick={submit} disabled={disabled}>{cta}</Button></>}
    >
      {failed && <EmptyState title="캠페인을 불러오지 못했어요">잠시 후 다시 열어 주세요.</EmptyState>}
      {!failed && !d && <p className="apply-note">불러오는 중…</p>}
      {d && !loggedIn && (
        <EmptyState title="가입하면 신청할 수 있어요" action={<Link to="/signup" className="btn btn-primary btn-md btn-pill" onClick={onClose}>가입하기</Link>}>
          활동명만 정하면 바로 시작할 수 있어요.
        </EmptyState>
      )}
      {d && loggedIn && c && (
        <div className="apply">
          <h3 style={{ margin: 0, fontSize: 18 }}>{c.title}</h3>
          <dl className="apply-dl">
            {c.type === 'practice' && c.schedule.runStart && <><dt>진행</dt><dd>{koLong(c.schedule.runStart)}{c.schedule.runDays ? `, ${Math.round(c.schedule.runDays / 7)}주` : ''}</dd></>}
            {c.type === 'offline' && c.schedule.eventDate && <><dt>일시</dt><dd>{koLong(c.schedule.eventDate)} {c.schedule.eventStart}{c.schedule.eventEnd ? ` – ${c.schedule.eventEnd}` : ''}</dd></>}
            {c.type === 'signature' && <><dt>전달</dt><dd>{c.schedule.deliveryDate ? koLong(c.schedule.deliveryDate) : ''}{s.deliveryTarget ? ` · ${s.deliveryTarget}` : ''}</dd></>}
            <dt>주최 모임</dt>
            <dd>{c.host.name}{host && c.type !== 'signature' ? ' (신청하면 자동 가입)' : ''}</dd>
          </dl>

          {c.type === 'practice' && (
            <>
              {s.startPoint?.enabled && (
                <section className="apply-sec">
                  <h3>출발점</h3>
                  <div className="apply-box">
                    {ms.length > 0 && (
                      <label className="apply-opt"><input type="radio" name="start" checked={start === 'saved'} onChange={() => setStart('saved')} />저장된 계산 결과 쓰기</label>
                    )}
                    {start === 'saved' && ms.length > 0 && (
                      <select className="input" aria-label="출발점으로 쓸 결과" value={startId} onChange={(e) => setStartId(e.target.value)}>
                        {ms.map((m) => <option key={m.id} value={m.id}>{koShort(m.simDate)}에 잰 결과 · {m.result.total.toFixed(1)}톤</option>)}
                      </select>
                    )}
                    <label className="apply-opt"><input type="radio" name="start" checked={start === 'later'} onChange={() => setStart('later')} />신청 후 다시 재기</label>
                    {start === 'later' && <p className="apply-note">신청을 마친 뒤 1.5도 계산기로 이동해요.</p>}
                  </div>
                </section>
              )}
              <section className="apply-sec">
                <h3>미션 알림</h3>
                <div className="apply-row">
                  <label className="apply-opt"><input type="checkbox" checked={remind && channel === 'push'} onChange={(e) => { setRemind(e.target.checked); setChannel('push'); }} />앱 푸시</label>
                  <label className="apply-opt"><input type="checkbox" checked={remind && channel === 'email'} onChange={(e) => { setRemind(e.target.checked); setChannel('email'); }} />이메일</label>
                  <input className="input" type="time" aria-label="알림 시각" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 130 }} />
                </div>
              </section>
            </>
          )}

          {c.type === 'signature' && (
            <>
              {s.demandSummary && <section className="apply-sec"><h3>요구안</h3><p className="apply-demand">{s.demandSummary}</p></section>}
              <Link to={`/campaigns/${c.id}#explainer`} onClick={onClose} className="field-hint" style={{ color: 'var(--c-green)', fontWeight: 600 }}>설명 글 보기 →</Link>
              <section className="apply-sec">
                <h3>서명할 때 함께 내는 정보</h3>
                <div className="apply-box">
                  <span>활동명 · {me?.nickname ?? sim.nickname}</span>
                  <span>사는 지역 · {[me?.sido, me?.sigungu].filter(Boolean).join(' ') || '지역 없음'}</span>
                  <span className="apply-note">가입할 때 적은 지역이 들어가 있어요. 서명은 이 지역의 의회로 전달돼요.</span>
                </div>
                {s.fields?.includes('realname') && (
                  <Field label="실명 (선택)"><input className="input" maxLength={20} value={realname} onChange={(e) => setRealname(e.target.value)} /></Field>
                )}
                {s.fields?.includes('opinion') && (
                  <Field label="한 줄 의견 (선택)"><input className="input" maxLength={100} value={opinion} onChange={(e) => setOpinion(e.target.value)} /></Field>
                )}
              </section>
            </>
          )}

          {c.type === 'offline' && (
            <>
              {s.askCompanions && (
                <section className="apply-sec">
                  <Field label="함께 오는 사람" hint={full ? '자리가 모두 찼어요. 대기로 신청하면 자리가 나는 순서대로 알려 드려요.' : seatsLeft != null ? `남은 자리 ${seatsLeft} · 함께 오는 사람도 정원에 들어가요.` : undefined}>
                    <select className="input" value={companions} onChange={(e) => setCompanions(Number(e.target.value))}>
                      {Array.from({ length: maxComp + 1 }, (_, i) => <option key={i} value={i}>{i === 0 ? '나 혼자 (동반 0명)' : `동반 ${i}명`}</option>)}
                    </select>
                  </Field>
                </section>
              )}
              {s.askTransport && (
                <section className="apply-sec">
                  <h3>어떻게 오세요? (선택)</h3>
                  <div className="apply-row">
                    {TRANSPORTS.map((t) => (
                      <label key={t} className="apply-opt"><input type="radio" name="transport" checked={transport === t} onChange={() => setTransport(t)} />{t}</label>
                    ))}
                  </div>
                  <p className="apply-note">운영진이 오는 길 안내를 준비하는 데에만 써요.</p>
                </section>
              )}
            </>
          )}

          <section className="apply-sec">
            <h3>동의</h3>
            {c.type === 'signature' ? (
              <>
                <label className="apply-opt"><input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} />[필수] 활동명과 사는 지역을 요구안과 함께 해당 의회에 전달하는 데 동의해요</label>
                {s.hostJoin === 'ask' && host && (
                  <label className="apply-opt"><input type="checkbox" checked={joinHost} onChange={(e) => setJoinHost(e.target.checked)} />[선택] 주최 모임 「{host}」 가입 신청</label>
                )}
                <p className="apply-note">공개 화면에는 서명 수만 보여요. 활동명과 지역은 운영자와 전달처만 봐요. 마감 전까지 서명을 취소할 수 있어요.</p>
              </>
            ) : (
              <>
                {host && <label className="apply-opt"><input type="checkbox" checked={hostOk} onChange={(e) => setHostOk(e.target.checked)} />[필수] 주최 모임 「{host}」 가입과 참가자 게시판 이용</label>}
                {c.type === 'practice' && (
                  <>
                    <label className="apply-opt"><input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} />[선택] 내 기록을 익명 집계로 녹색전환연구소 연구에 활용</label>
                    <p className="apply-note">내 개별 기록은 나와 주최 모임 운영진만 볼 수 있어요.</p>
                  </>
                )}
                {c.type === 'offline' && (
                  <>
                    {s.photoConsent && <label className="apply-opt"><input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} />[선택] 현장 사진 촬영, 모임 게시판과 결과 보고에 사진 게시</label>}
                    <p className="apply-note">사진에 동의하지 않으면 운영진 명단에 표시돼요. 연락은 플랫폼 알림과 이메일로만 하고 전화번호는 받지 않아요.</p>
                  </>
                )}
              </>
            )}
          </section>
          {error && <p className="apply-err" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
