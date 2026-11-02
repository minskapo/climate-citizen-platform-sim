import { useRef, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';

export const HTML_MAX_BYTES = 1024 * 1024;
export type Perm = 'user' | 'participation' | 'record';
export type Op = 'sum' | 'avg' | 'count';
export interface ToolManifest { permissions: Perm[]; saveKeys: string[]; aggregateKeys: Array<{ key: string; op: Op }>; startPoint: boolean }
export const PERM_LABEL: Record<Perm, string> = { user: '사용자 정보', participation: '캠페인 참가 여부', record: '기록 저장' };
export const OP_LABEL: Record<Op, string> = { sum: '합계', avg: '평균', count: '개수' };
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const KEY_RE = /^[A-Za-z0-9_]{1,40}$/;

const sizeText = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);

/** 외부로 나가는 요청 흔적(fetch · XHR · 외부 주소 src)을 대충 훑는다. 확정 검사가 아니라 안내용. */
export function scanHtml(html: string): { external: boolean } {
  return { external: /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\b|<(script|img|link|iframe)[^>]+(src|href)=["']https?:\/\//i.test(html) };
}

/** 웹 도구 올리기: HTML 1개(≤1MB) + 설명 입력란. toolId가 있으면 새 버전으로 올린다. */
export function UploadToolModal({ tool, onClose, onDone }: {
  tool?: { id: string; name: string; manifest?: ToolManifest }; onClose(): void; onDone(): void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; size: number; html: string } | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [kind, setKind] = useState<'block' | 'page'>('block');
  const [perms, setPerms] = useState<Perm[]>(tool?.manifest?.permissions ?? []);
  const [saveKeys, setSaveKeys] = useState((tool?.manifest?.saveKeys ?? []).join(', '));
  const [aggs, setAggs] = useState<Array<{ key: string; op: Op }>>(tool?.manifest?.aggregateKeys ?? []);
  const [start, setStart] = useState(tool?.manifest?.startPoint ?? false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    if (!/\.html?$/i.test(f.name)) { setFile(null); setErr('HTML 파일(.html) 하나만 올릴 수 있어요'); return; }
    if (f.size > HTML_MAX_BYTES) { setFile(null); setErr('HTML은 1MB 이하만 올릴 수 있어요'); return; }
    setFile({ name: f.name, size: f.size, html: await f.text() });
  };

  const submit = async () => {
    setErr(null);
    if (!file) { setErr('HTML 파일을 골라 주세요'); return; }
    if (!tool) {
      if (!name.trim()) { setErr('이름을 적어 주세요'); return; }
      if (!SLUG_RE.test(slug)) { setErr('주소는 영문 소문자 · 숫자 · 하이픈 2~40자로 적어 주세요'); return; }
    }
    const keys = saveKeys.split(/[,\s]+/).filter(Boolean);
    if (keys.some((k) => !KEY_RE.test(k)) || aggs.some((a) => !KEY_RE.test(a.key))) { setErr('저장 값 · 집계 값 이름은 영문 · 숫자 · _ 만 쓸 수 있어요'); return; }
    const manifest: ToolManifest = { permissions: perms, saveKeys: keys, aggregateKeys: aggs, startPoint: start };
    setBusy(true);
    try {
      if (tool) {
        const r = await api<{ version: number }>(`/api/tools/${tool.id}/versions`, { body: { html: file.html, manifest } });
        showToast(`v${r.version}을 올렸어요 · 게시 대기 상태예요`);
      } else {
        await api('/api/tools', { body: { name: name.trim(), slug, kind, html: file.html, manifest } });
        showToast('웹 도구를 올렸어요 · 게시 대기 상태예요');
      }
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '올리지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const scan = file ? scanHtml(file.html) : null;
  return (
    <Modal
      open onClose={onClose} title={tool ? `${tool.name} · 새 버전 올리기` : '웹 도구 올리기'} width={560}
      description="올리면 「게시 대기」 상태가 돼요. 미리보기로 확인한 뒤 게시해요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button disabled={busy} onClick={() => void submit()}>게시 대기로 올리기</Button></>}
    >
      <div className="ed-modal-form">
        <div className="ed-row">
          <span className="ed-label">HTML 파일 (1개 · 1MB 이하)</span>
          <div className="ed-dt">
            <Button variant="outline" size="sm" pill onClick={() => ref.current?.click()}>{file ? '다른 파일 고르기' : '파일 고르기'}</Button>
            {file && <span className="ed-muted">{file.name} · {sizeText(file.size)}</span>}
          </div>
          <input ref={ref} type="file" accept=".html,.htm,text/html" hidden aria-label="HTML 파일" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void pick(f); }} />
        </div>
        {scan && (
          <ul className="adm-checks" aria-label="자동 검사">
            <li className="is-ok">✓ HTML을 읽었어요 · {sizeText(file!.size)}</li>
            <li className={scan.external ? 'is-warn' : 'is-ok'}>{scan.external ? '! 외부 서버로 보내는 요청이 있을 수 있어요 · 플랫폼 연결 기능만 쓸 수 있어요' : '✓ 외부 서버로 보내는 요청이 없어요'}</li>
          </ul>
        )}
        {!tool && (
          <>
            <label className="ed-row"><span className="ed-label">이름</span>
              <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 자전거 이동 기록 도구" /></label>
            <label className="ed-row"><span className="ed-label">주소 (/tools/…)</span>
              <input className="input" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="bike-log" /></label>
            <div className="ed-row">
              <span className="ed-label">규격</span>
              <div className="ed-chips" role="radiogroup" aria-label="규격">
                {([['block', '블록형'], ['page', '페이지형']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} className={`ed-chip${kind === k ? ' is-on' : ''}`} onClick={() => setKind(k)}>{l}</button>
                ))}
              </div>
            </div>
          </>
        )}
        <fieldset className="ed-row adm-fieldset">
          <legend className="ed-label">필요한 권한</legend>
          {(Object.keys(PERM_LABEL) as Perm[]).map((p) => (
            <label key={p} className="ed-consent"><input type="checkbox" checked={perms.includes(p)} onChange={(e) => setPerms(e.target.checked ? [...perms, p] : perms.filter((x) => x !== p))} /> {PERM_LABEL[p]}</label>
          ))}
        </fieldset>
        <label className="ed-row"><span className="ed-label">저장 값 (쉼표로 나눠요)</span>
          <input className="input" value={saveKeys} onChange={(e) => setSaveKeys(e.target.value)} placeholder="date, mode, km" /></label>
        <div className="ed-row">
          <span className="ed-label">집계 값</span>
          {aggs.map((a, i) => (
            <div key={i} className="ed-dt">
              <input className="input" aria-label={`집계 값 이름 ${i + 1}`} value={a.key} onChange={(e) => setAggs(aggs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
              <select className="input ed-time" aria-label={`집계 방식 ${i + 1}`} value={a.op} onChange={(e) => setAggs(aggs.map((x, j) => (j === i ? { ...x, op: e.target.value as Op } : x)))}>
                {(Object.keys(OP_LABEL) as Op[]).map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
              </select>
              <button type="button" className="ed-link-btn" onClick={() => setAggs(aggs.filter((_, j) => j !== i))}>빼기</button>
            </div>
          ))}
          <div><Button variant="outline" size="sm" pill onClick={() => setAggs([...aggs, { key: '', op: 'sum' }])}>+ 집계 값 추가</Button></div>
        </div>
        <label className="ed-consent"><input type="checkbox" checked={start} onChange={(e) => setStart(e.target.checked)} /> 출발점 도구로 쓸 수 있어요 (마지막 기록을 출발점으로)</label>
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}
