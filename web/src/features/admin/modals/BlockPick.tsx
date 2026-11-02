import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/ui';
import { useEditor } from '../editor/context';
import { toolVersionLabel } from '../editor/model';
import { PickList } from './PickList';

const NONE = '__none__';

/** 맞춤 영역 고르기: 「웹 도구」에 올린 블록형 HTML */
export function BlockPickModal({ current, onClose, onPick }: { current: string | null; onClose(): void; onPick(id: string | null): void }) {
  const ed = useEditor();
  const [sel, setSel] = useState(current ?? NONE);
  const blocks = ed.toolList.filter((t) => t.kind === 'block');
  return (
    <Modal
      open onClose={onClose} title="맞춤 영역 고르기" description="「웹 도구」에 올린 블록형 HTML 중에서 골라요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button onClick={() => onPick(sel === NONE ? null : sel)}>선택</Button></>}
    >
      <div className="picker">
        <PickList
          label="블록형 웹 도구" selected={[sel]} onSelect={setSel}
          items={[...blocks.map((t) => ({ id: t.id, name: t.name, sub: toolVersionLabel(t) })), { id: NONE, name: '맞춤 영역 없음', sub: '공통 틀만 보여요' }]}
        />
        <p className="picker-note">필요한 블록이 없나요? <Link to="/admin/tools" className="ed-green">웹 도구에서 새로 올리기 →</Link></p>
      </div>
    </Modal>
  );
}
