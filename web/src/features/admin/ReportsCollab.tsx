import { useCallback, useEffect, useState } from 'react';
import { hiddenNoticeText } from '@shared/text';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { Button, Chip, LoadError, Spinner } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import { useSim } from '../../lib/sim';
import { addDays } from '@shared/date';
import type { HHMM, ISODate } from '@shared/types';
import { useAdminCrumbs } from './AdminLayout';
import { FilterTabs } from './participantsCommon';

interface Report { id: string; targetType: string; reason: string; status: string; createdAt: string; simDate?: string | null; reporter: string | null; preview: string | null; targetHidden: boolean | null }
interface Collab {
  id: string; title: string; idea: string; period: string; size: string; status: string; dueAt: string | null; createdAt: string; simDate?: string | null;
  author: string | null; groupName: string | null; campaignId: string | null; replies: Array<{ id: string; body: string }>;
}
const TARGET: Record<string, string> = { post: '게시글', comment: '댓글', group: '모임' };
const REASONS = ['광고', '저작권', '괴롭힘', '개인정보', '기타'];
const mdDate = (d: string) => `${Number(d.slice(5, 7))}. ${Number(d.slice(8, 10))}.`;
const mdReal = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}. ${d.getDate()}.`; };
/** 접수일: 보낸 사람의 내 날짜(sim_date)가 있으면 그것, 없으면 실제 시각. */
const md = (r: { simDate?: string | null; createdAt: string }) => (r.simDate ? mdDate(r.simDate) : mdReal(r.createdAt));

/**
 * 답변 기한(제안자의 내 날짜 · 시각 + 24시간, "YYYY-MM-DDTHH:MM")을 보는 사람의 내 날짜 · 시각과 비교해
 * 「오늘까지 답변」 「내일까지 답변」 「답변 기한이 지났어요」로 바꾼다.
 */
export function dueLabel(dueAt: string | null, today: ISODate, time: HHMM): string {
  if (!dueAt) return '';
  const dueDate = dueAt.slice(0, 10);
  const dueTime = dueAt.slice(11, 16);
  if (`${today}T${time}` > `${dueDate}T${dueTime}`) return '답변 기한이 지났어요';
  if (dueDate === today) return '오늘까지 답변';
  if (dueDate === addDays(today, 1)) return '내일까지 답변';
  return `${mdDate(dueDate)}까지 답변`;
}

type Tab = 'reports' | 'collab' | 'done';

/** M-4 신고 · 협업 제안 */
export function ReportsCollab({ initialTab = 'reports' }: { initialTab?: Tab }) {
  useAdminCrumbs(['신고 · 협업 제안']);
  const nav = useNavigate();
  const sim = useSim();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [collab, setCollab] = useState<Collab[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hide, setHide] = useState<Report | null>(null);
  const [reply, setReply] = useState<Collab | null>(null);

  const load = useCallback(() => {
    Promise.all([api<{ items: Report[] }>('/api/admin/reports', { quiet: true }), api<{ items: Collab[] }>('/api/admin/collab', { quiet: true })])
      .then(([r, c]) => { setReports(r.items); setCollab(c.items); setFailed(false); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (!reports || !collab) return <Spinner />;
  const openR = reports.filter((r) => r.status === 'open');
  const openC = collab.filter((c) => c.status === 'open');
  const doneR = reports.filter((r) => r.status !== 'open');
  const doneC = collab.filter((c) => c.status !== 'open');

  const dismiss = async (r: Report) => {
    try {
      await api(`/api/admin/reports/${r.id}`, { body: { action: 'dismiss' } });
      showToast('문제 없음으로 처리했어요 · 신고한 사람에게 결과를 알려요');
      load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '처리하지 못했어요');
    }
  };
  const draft = async (c: Collab) => {
    try {
      const r = await api<{ campaignId: string }>(`/api/admin/collab/${c.id}/draft`, { body: {} });
      nav(`/admin/campaigns/${r.campaignId}/edit`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '초안을 만들지 못했어요');
    }
  };

  const collabCard = (c: Collab, done: boolean) => (
    <li key={c.id} className="adm-collab card">
      <div className="adm-collab-head">
        <div>
          <h3 className="adm-strong">{c.title}</h3>
          <p className="adm-muted">{c.groupName ?? c.author ?? '회원'}{c.groupName && c.author ? ` · ${c.author}` : ''} · {md(c)} 접수{!done && c.dueAt ? ` · ${dueLabel(c.dueAt, sim.today, sim.nowTime)}` : ''}</p>
        </div>
        <div className="adm-head-actions">
          {c.status === 'open' && <Button variant="outline" size="sm" pill onClick={() => setReply(c)}>답장하기</Button>}
          {c.campaignId
            ? <Button variant="outline" size="sm" pill onClick={() => nav(`/admin/campaigns/${c.campaignId}/edit`)}>초안 열기</Button>
            : <Button size="sm" pill onClick={() => void draft(c)}>캠페인 초안 만들기</Button>}
        </div>
      </div>
      <p>{c.idea}</p>
      {c.replies.map((x) => <p key={x.id} className="adm-reply">↳ {x.body}</p>)}
    </li>
  );

  return (
    <div>
      <div className="adm-head">
        <div>
          <h1 className="adm-title">신고 · 협업 제안</h1>
          <p className="adm-lead">자료와 외부 링크는 바로 게시되고, 문제가 생기면 신고로 사후 처리해요.</p>
        </div>
      </div>
      <div className="adm-toolbar">
        <FilterTabs<Tab> value={tab} onChange={setTab} tabs={[['reports', `신고 ${openR.length}`], ['collab', `협업 제안 ${openC.length}`], ['done', '처리 완료']]} />
      </div>
      {tab === 'reports' && (
        <>
          <div className="adm-table-wrap card adm-table-card">
            <table className="adm-table">
              <thead><tr><th>대상</th><th>내용</th><th>사유</th><th>접수</th><th>처리</th></tr></thead>
              <tbody>
                {openR.map((r) => (
                  <tr key={r.id}>
                    <td><Chip tone="gray">{TARGET[r.targetType] ?? r.targetType}</Chip></td>
                    <td>{r.preview ? `「${r.preview}」` : '(이미 지워진 내용)'}{r.reporter && <small className="adm-muted"> 신고 · {r.reporter}</small>}</td>
                    <td>{r.reason}</td>
                    <td>{md(r)}</td>
                    <td className="adm-actions">
                      {/* 모임은 숨길 수 없어요(모임 닫기는 「모임」 화면에서). 모임 신고는 「문제 없음」만. */}
                      {r.targetType !== 'group' && <button type="button" onClick={() => setHide(r)} aria-label={`숨기기 ${r.preview ?? ''}`}>숨기기</button>}
                      <button type="button" onClick={() => void dismiss(r)} aria-label={`문제 없음 ${r.preview ?? ''}`}>문제 없음</button>
                    </td>
                  </tr>
                ))}
                {openR.length === 0 && <tr><td colSpan={5} className="adm-empty">처리할 신고가 없어요</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="adm-muted adm-foot-note">숨긴 글은 작성자와 관리자에게만 보여요. 같은 사람이 3번 숨김 처리되면 「회원」에서 이용 제한을 검토해요. 모임 안의 글은 모임 운영진도 숨길 수 있어요. 모임 신고는 숨기지 않고 「모임」 화면에서 닫기를 검토해요.</p>
        </>
      )}
      {tab === 'collab' && (
        <>
          <p className="adm-muted">캠페인은 제안을 바탕으로 연구소가 만들어요 · 제안은 1일 안에 답변해요</p>
          <ul className="adm-collab-list">{openC.map((c) => collabCard(c, false))}</ul>
          {openC.length === 0 && <p className="adm-empty">답변할 제안이 없어요</p>}
          <p className="adm-muted adm-foot-note">「캠페인 초안 만들기」를 누르면 제안 내용과 주최 모임이 채워진 캠페인 만들기 화면이 열려요.</p>
        </>
      )}
      {tab === 'done' && (
        <>
          <div className="adm-table-wrap card adm-table-card">
            <table className="adm-table">
              <thead><tr><th>대상</th><th>내용</th><th>사유</th><th>접수</th><th>결과</th></tr></thead>
              <tbody>
                {doneR.map((r) => (
                  <tr key={r.id}>
                    <td>{TARGET[r.targetType] ?? r.targetType}</td><td>{r.preview ? `「${r.preview}」` : '–'}</td><td>{r.reason}</td><td>{md(r)}</td>
                    <td>{r.status === 'hidden' ? '숨김' : '문제 없음'}</td>
                  </tr>
                ))}
                {doneR.length === 0 && <tr><td colSpan={5} className="adm-empty">처리한 신고가 없어요</td></tr>}
              </tbody>
            </table>
          </div>
          <h2 className="adm-h2 adm-gap">답장한 협업 제안</h2>
          <ul className="adm-collab-list">{doneC.map((c) => collabCard(c, true))}</ul>
          {doneC.length === 0 && <p className="adm-empty">답장한 제안이 없어요</p>}
        </>
      )}
      {hide && <HideModal report={hide} onClose={() => setHide(null)} onDone={load} />}
      {reply && <ReplyModal collab={reply} onClose={() => setReply(null)} onDone={load} />}
    </div>
  );
}

function HideModal({ report, onClose, onDone }: { report: Report; onClose(): void; onDone(): void }) {
  const [reason, setReason] = useState(REASONS.includes(report.reason) ? report.reason : '기타');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/reports/${report.id}`, { body: { action: 'hide', reason, notify } });
      showToast(notify ? '숨겼어요 · 작성자에게 이유를 알렸어요' : '숨겼어요');
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '숨기지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open onClose={onClose} title={`이 ${TARGET[report.targetType] ?? '글'}을 숨길까요?`} description="숨긴 글은 작성자와 관리자에게만 보여요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="danger" disabled={busy} onClick={() => void submit()}>숨기기</Button></>}
    >
      <div className="ed-modal-form">
        <p className="adm-strong">{report.preview ? `「${report.preview}」` : ''}</p>
        <div className="ed-row">
          <span className="ed-label">숨기는 이유</span>
          <div className="ed-chips" role="radiogroup" aria-label="숨기는 이유">
            {REASONS.map((r) => <button key={r} type="button" role="radio" aria-checked={reason === r} className={`ed-chip${reason === r ? ' is-on' : ''}`} onClick={() => setReason(r)}>{r}</button>)}
          </div>
        </div>
        <label className="adm-radio"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span><b>작성자에게 알리기</b><small>「{hiddenNoticeText(reason)}」라고 알림이 가요.</small></span></label>
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}

function ReplyModal({ collab, onClose, onDone }: { collab: Collab; onClose(): void; onDone(): void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!body.trim()) { setErr('답장을 적어 주세요'); return; }
    setBusy(true);
    try {
      await api(`/api/admin/collab/${collab.id}/reply`, { body: { body: body.trim() } });
      showToast('답장을 보냈어요');
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '보내지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open onClose={onClose} title="답장하기" description="답장은 제안자의 알림으로 가요. 제안을 받은 뒤 1일 안에 보내 주세요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button disabled={busy} onClick={() => void submit()}>보내기</Button></>}
    >
      <div className="ed-modal-form">
        <dl className="ed-confirm">
          <div><dt>받는 사람</dt><dd>{collab.groupName ?? collab.author ?? '회원'}</dd></div>
          <div><dt>제안</dt><dd>{collab.title}</dd></div>
        </dl>
        <label className="ed-row"><span className="ed-label">내용</span>
          <textarea className="input ed-textarea" rows={5} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}
