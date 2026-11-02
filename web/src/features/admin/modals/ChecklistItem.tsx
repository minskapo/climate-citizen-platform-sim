import { useEffect, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useEditor } from '../editor/context';
import { CALCULATOR_TOOL, type CustomItem } from '../editor/model';
import { ChipGroup, FieldError } from '../editor/parts';

/** 체크리스트 항목 추가: 문구 + 연결할 곳(게시판 글 · 도구 · 외부 링크) */
export function ChecklistItemModal({ title, onClose, onAdd }: { title: string; onClose(): void; onAdd(item: CustomItem): Promise<boolean> }) {
  const ed = useEditor();
  const [label, setLabel] = useState('');
  const [linkType, setLinkType] = useState<CustomItem['linkType']>(ed.id ? 'post' : 'url');
  const [target, setTarget] = useState('');
  const [posts, setPosts] = useState<Array<{ id: string; title: string }>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tools = [CALCULATOR_TOOL, ...ed.toolList];

  useEffect(() => {
    if (!ed.id) return;
    api<{ items: Array<{ id: string; title: string }> }>(`/api/boards/campaign/${ed.id}/posts`, { quiet: true })
      .then((r) => setPosts(r.items ?? []))
      .catch(() => setPosts([]));
  }, [ed.id]);

  const targetLabel = linkType === 'post' ? posts.find((p) => p.id === target)?.title : linkType === 'tool' ? tools.find((t) => t.id === target)?.name : target;

  const add = async () => {
    setErr(null);
    if (!label.trim()) { setErr('항목 이름을 적어 주세요'); return; }
    if (!target.trim()) { setErr(linkType === 'url' ? '링크 주소를 적어 주세요' : '연결할 곳을 골라 주세요'); return; }
    setBusy(true);
    await onAdd({ label: label.trim(), linkType, target: target.trim(), targetLabel });
    setBusy(false);
  };

  return (
    <Modal
      open onClose={onClose} title={title} description="운영자가 직접 넣는 항목은 참가자가 링크를 누르면 완료로 표시돼요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button disabled={busy} onClick={() => void add()}>추가</Button></>}
    >
      <div className="ed-modal-form">
        <label className="ed-row">
          <span className="ed-label">항목 이름</span>
          <div className="ed-input-count">
            <input className="input" maxLength={30} value={label} placeholder="예: 시작 전 공지 읽기" onChange={(e) => setLabel(e.target.value)} />
            <span className="ed-count">{[...label].length} / 30</span>
          </div>
        </label>
        <div className="ed-row">
          <span className="ed-label">연결할 곳</span>
          <ChipGroup<CustomItem['linkType']>
            label="연결할 곳" value={linkType} onChange={(v) => { setLinkType(v); setTarget(''); }}
            options={[['post', '게시판 글'], ['tool', '도구'], ['url', '외부 링크']]}
          />
        </div>
        {linkType === 'post' && (
          posts.length ? (
            <select className="input" aria-label="게시판 글" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">글을 골라 주세요</option>
              {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          ) : <p className="ed-hint">아직 캠페인 게시판에 글이 없어요. 공개 뒤 게시판에 공지를 올리고 연결하거나, 외부 링크를 써요.</p>
        )}
        {linkType === 'tool' && (
          <select className="input" aria-label="도구" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">도구를 골라 주세요</option>
            {tools.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {linkType === 'url' && (
          <input className="input" type="url" aria-label="링크 주소" placeholder="https://" value={target} onChange={(e) => setTarget(e.target.value)} />
        )}
        {err && <p className="field-error" role="alert">{err}</p>}
        <FieldError name="checklist" />
      </div>
    </Modal>
  );
}
