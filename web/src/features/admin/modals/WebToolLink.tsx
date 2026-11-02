import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/ui';
import { useEditor } from '../editor/context';
import { CALCULATOR_TOOL, toolVersionLabel } from '../editor/model';
import { PickList } from './PickList';

/** 웹 도구 연결하기: 「웹 도구」에 올린 HTML 중 여러 개 */
export function WebToolLinkModal({ linked, onClose, onLink }: { linked: string[]; onClose(): void; onLink(ids: string[]): Promise<void> }) {
  const ed = useEditor();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const all = [CALCULATOR_TOOL, ...ed.toolList].filter((t) => !linked.includes(t.id));
  const shown = all.filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal
      open onClose={onClose} title="웹 도구 연결하기" description="「웹 도구」에 올린 HTML 중에서 골라요. 진행 가이드 같은 파일은 설정 화면에서 바로 올려요."
      footer={<>
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button disabled={!sel.length || busy} onClick={async () => { setBusy(true); try { await onLink(sel); } finally { setBusy(false); } }}>
          {sel.length ? `${sel.length}개 연결` : '연결'}
        </Button>
      </>}
    >
      <div className="picker">
        <input className="input" placeholder="⌕  도구 이름 검색" aria-label="도구 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <PickList
          label="웹 도구" selected={sel} onSelect={(id) => setSel((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))}
          empty={<p className="picker-note">연결할 수 있는 웹 도구가 없어요.</p>}
          items={shown.map((t) => ({
            id: t.id, name: t.name,
            sub: [t.kind === 'block' ? '블록형' : '페이지형', t.kind === 'page' ? `/tools/${t.slug ?? t.id}` : '', toolVersionLabel(t)].filter(Boolean).join(' · '),
          }))}
        />
      </div>
    </Modal>
  );
}
