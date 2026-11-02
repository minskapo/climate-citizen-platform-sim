import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { Button, Chip, EmptyState, LoadError, Spinner } from '../../components/ui';
import { showToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import { useAdminCrumbs } from './AdminLayout';
import { md } from './editor/model';
import { OP_LABEL, PERM_LABEL, UploadToolModal, type ToolManifest } from './UploadToolModal';

interface Version { version: number; status: 'pending' | 'published' | 'archived'; createdAt: string; manifest: ToolManifest; htmlBytes: number }
interface Tool {
  id: string; name: string; slug: string | null; kind: 'block' | 'page'; createdAt: string;
  published: { version: number } | null; usedBy: Array<{ id: string; title: string }>; versions: Version[];
}
const VSTATUS = { pending: ['게시 대기', 'yellow'], published: ['게시 중', 'green'], archived: ['이전 버전', 'gray'] } as const;
const where = (t: Tool) => (t.kind === 'page' ? `페이지형 · /tools/${t.slug}` : '블록형 · 캠페인 맞춤 영역');
const pendingOf = (t: Tool) => t.versions.find((v) => v.status === 'pending');

/** M-3 웹 도구 관리 */
export function WebTools() {
  useAdminCrumbs(['웹 도구']);
  const nav = useNavigate();
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [upload, setUpload] = useState<'new' | 'version' | null>(null);
  const [publish, setPublish] = useState<number | null>(null);
  const [rollback, setRollback] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ items: Tool[] }>('/api/tools', { quiet: true }).then((r) => { setTools(r.items); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (!tools) return <Spinner />;
  const tool = tools.find((t) => t.id === sel) ?? tools[0] ?? null;
  const pending = tool ? pendingOf(tool) : undefined;
  const manifest = tool ? (tool.versions.find((v) => v.status === 'published') ?? tool.versions[0])?.manifest : undefined;
  const label = (t: Tool) => { const p = pendingOf(t); return p ? `v${p.version}` : t.published ? `v${t.published.version}` : '–'; };
  const state = (t: Tool): [string, 'yellow' | 'green' | 'gray'] => (pendingOf(t) ? ['게시 대기', 'yellow'] : t.published ? ['게시 중', 'green'] : ['미게시', 'gray']);

  const run = async (kind: 'publish' | 'rollback', v: number) => {
    if (!tool) return;
    setBusy(true); setErr(null);
    try {
      if (kind === 'publish') {
        await api(`/api/tools/${tool.id}/versions/${v}/publish`, { body: {} });
        showToast(`v${v}을 게시했어요${tool.usedBy.length ? ` · ${tool.usedBy.map((u) => u.title).join(', ')}에 바로 반영돼요` : ''}`);
        setPublish(null);
      } else {
        await api(`/api/tools/${tool.id}/rollback`, { body: { toVersion: v } });
        showToast(`v${v}로 되돌렸어요`);
        setRollback(null);
      }
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '처리하지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  const current = tool?.versions.find((v) => v.status === 'published');

  return (
    <div>
      <div className="adm-head">
        <div>
          <h1 className="adm-title">웹 도구</h1>
          <p className="adm-lead">바이브코딩으로 만든 HTML을 올리고 버전을 관리해요. 블록형은 캠페인 맞춤 영역에, 페이지형은 전체 화면으로 열려요.</p>
        </div>
        <div className="adm-head-actions">
          <a className="btn btn-outline btn-md btn-pill" href={`${import.meta.env.BASE_URL}tool-template.html`} download="tool-template.html" onClick={() => showToast('tool-template.html을 내려받았어요 · 디자인 토큰과 연결 예제가 들어 있어요')}>시작 템플릿 내려받기</a>
          <Button pill onClick={() => setUpload('new')}>+ HTML 올리기</Button>
        </div>
      </div>
      {tools.length === 0 ? <EmptyState title="아직 올린 웹 도구가 없어요" action={<Button pill onClick={() => setUpload('new')}>+ HTML 올리기</Button>} /> : (
        <div className="adm-tools">
          <div className="adm-table-wrap card adm-table-card">
            <table className="adm-table">
              <thead><tr><th>웹 도구</th><th>규격</th><th>버전</th><th>쓰는 곳</th><th>상태</th></tr></thead>
              <tbody>
                {tools.map((t) => {
                  const [st, tone] = state(t);
                  return (
                    <tr key={t.id} className={t.id === tool?.id ? 'is-sel' : ''} onClick={() => setSel(t.id)}>
                      <td><button type="button" className="adm-rowbtn" onClick={() => setSel(t.id)}><span className="adm-strong">{t.name}</span><small className="adm-muted">{t.kind === 'page' ? `/tools/${t.slug}` : '캠페인 맞춤 영역'}</small></button></td>
                      <td><Chip tone={t.kind === 'page' ? 'blue' : 'yellow'}>{t.kind === 'page' ? '페이지형' : '블록형'}</Chip></td>
                      <td>{label(t)}</td>
                      <td>{t.usedBy.length ? t.usedBy.map((u) => u.title).join(', ') : '–'}</td>
                      <td><Chip tone={tone} square>{st}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {tool && (
            <aside className="card adm-tool-side" aria-label="선택한 웹 도구">
              <h2 className="adm-h2">{tool.name} <Chip tone={state(tool)[1]} square>{state(tool)[0]}</Chip></h2>
              <button type="button" className="adm-drop" onClick={() => setUpload('version')}><b>새 버전 올리기</b><span>HTML 파일 하나와 설명을 입력해 올려요</span></button>
              <h3 className="adm-h3">설명</h3>
              <dl className="adm-kv">
                <div><dt>규격</dt><dd>{where(tool)}</dd></div>
                <div><dt>필요한 권한</dt><dd>{manifest?.permissions.length ? manifest.permissions.map((p) => PERM_LABEL[p]).join(' · ') : '없음'}</dd></div>
                <div><dt>저장 값</dt><dd>{manifest?.saveKeys.length ? manifest.saveKeys.join(' · ') : '없음'}</dd></div>
                <div><dt>집계 값</dt><dd>{manifest?.aggregateKeys.length ? manifest.aggregateKeys.map((a) => `${a.key}(${OP_LABEL[a.op]})`).join(' · ') : '없음'}</dd></div>
                <div><dt>출발점 도구로 쓰기</dt><dd>{manifest?.startPoint ? '가능 (마지막 기록을 출발점으로)' : '쓰지 않음'}</dd></div>
              </dl>
              <h3 className="adm-h3">버전 기록</h3>
              <ul className="adm-versions">
                {tool.versions.map((v) => (
                  <li key={v.version}>
                    <b>v{v.version}</b>
                    <span className="adm-muted">{md(v.createdAt.slice(0, 10))} 올림</span>
                    {v.status === 'archived'
                      ? <button type="button" className="adm-link" aria-label={`v${v.version}로 되돌리기`} onClick={() => { setErr(null); setRollback(v.version); }}>되돌리기</button>
                      : <Chip tone={VSTATUS[v.status][1]} square>{VSTATUS[v.status][0]}</Chip>}
                  </li>
                ))}
              </ul>
              <div className="adm-side-actions">
                <Button variant="outline" pill block disabled={!tool.versions.length} onClick={() => nav(`/admin/tools/${tool.id}/preview?v=${(pending ?? current ?? tool.versions[0]).version}`)}>미리보기 ↗</Button>
                {pending && <Button pill block onClick={() => { setErr(null); setPublish(pending.version); }}>v{pending.version} 게시하기</Button>}
              </div>
              <p className="adm-muted">미리보기는 실제 화면과 같은 틀에서 테스트 계정으로 열려요. 게시하면 이 도구를 쓰는 모든 캠페인에 바로 반영돼요.</p>
            </aside>
          )}
        </div>
      )}
      <section className="adm-security" aria-label="보안 · 실행 원칙">
        <h2 className="adm-h2">보안 · 실행 원칙</h2>
        <p>· 웹 도구는 플랫폼과 다른 주소에서 실행되어 로그인 정보에 직접 접근할 수 없어요.</p>
        <p>· 로그인 · 저장 · 집계는 플랫폼 연결 기능으로만 해요. 도구 안에 자체 로그인이나 외부 서버를 두지 않아요.</p>
        <p>· 설명 파일에 적지 않은 권한은 쓸 수 없어요.</p>
      </section>
      {upload === 'new' && <UploadToolModal onClose={() => setUpload(null)} onDone={load} />}
      {upload === 'version' && tool && <UploadToolModal tool={{ id: tool.id, name: tool.name, manifest: manifest }} onClose={() => setUpload(null)} onDone={load} />}
      {publish != null && tool && (
        <Modal
          open onClose={() => setPublish(null)} title={`v${publish}을 게시할까요?`} description="게시하면 이 도구를 쓰는 모든 곳에 바로 반영돼요."
          footer={<><Button variant="ghost" onClick={() => setPublish(null)}>취소</Button><Button disabled={busy} onClick={() => void run('publish', publish)}>게시하기</Button></>}
        >
          <dl className="ed-confirm">
            <div><dt>반영되는 곳</dt><dd>{[tool.kind === 'page' ? `도구 페이지 /tools/${tool.slug}` : null, ...tool.usedBy.map((u) => `캠페인 「${u.title}」`)].filter(Boolean).join(' · ') || '아직 쓰는 곳이 없어요'}</dd></div>
            <div><dt>기존 기록</dt><dd>{JSON.stringify(current?.manifest.saveKeys ?? []) === JSON.stringify(tool.versions.find((v) => v.version === publish)?.manifest.saveKeys) ? '그대로 이어져요 (저장 값 변화 없음)' : '저장 값이 바뀌어요. 이전 기록은 지워지지 않아요'}</dd></div>
          </dl>
          {current && <p className="ed-hint">문제가 생기면 버전 기록에서 v{current.version}로 바로 되돌릴 수 있어요.</p>}
          {err && <p className="field-error" role="alert">{err}</p>}
        </Modal>
      )}
      {rollback != null && tool && (
        <Modal
          open danger onClose={() => setRollback(null)} title={`v${rollback}로 되돌릴까요?`}
          description={current ? `지금 게시 중인 v${current.version} 대신 v${rollback}이 모든 곳에 다시 쓰여요.` : `v${rollback}이 모든 곳에 다시 쓰여요.`}
          footer={<><Button variant="ghost" onClick={() => setRollback(null)}>취소</Button><Button variant="danger" disabled={busy} onClick={() => void run('rollback', rollback)}>v{rollback}로 되돌리기</Button></>}
        >
          <p className="ed-hint">v{rollback} 이후에 추가된 저장 값은 v{rollback} 화면에서 보이지 않아요. 기록 자체는 지워지지 않아요.</p>
          {err && <p className="field-error" role="alert">{err}</p>}
        </Modal>
      )}
    </div>
  );
}
