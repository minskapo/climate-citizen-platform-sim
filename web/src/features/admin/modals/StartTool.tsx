import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/ui';
import { useEditor } from '../editor/context';
import { CALCULATOR_TOOL, type AdminTool } from '../editor/model';
import { PickList } from './PickList';

const canStart = (t: AdminTool) => t.kind === 'page' && (!!t.published?.manifest?.startPoint || !!t.versions?.[0]?.manifest?.startPoint);

/** 출발점 도구 고르기: 출발점으로 쓸 수 있는 페이지형 웹 도구만 */
export function StartToolModal({ current, onClose, onPick }: { current: string; onClose(): void; onPick(id: string): void }) {
  const ed = useEditor();
  const [sel, setSel] = useState(current);
  const tools = [CALCULATOR_TOOL, ...ed.toolList.filter(canStart)];
  return (
    <Modal
      open onClose={onClose} title="출발점 도구 고르기" description="출발점으로 쓸 수 있는 페이지형 웹 도구만 보여요."
      footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button disabled={!sel} onClick={() => onPick(sel)}>선택</Button></>}
    >
      <div className="picker">
        <PickList
          label="출발점 도구" selected={[sel]} onSelect={setSel}
          items={tools.map((t) => ({ id: t.id, name: t.name, sub: t.id === CALCULATOR_TOOL.id ? '페이지형 · 1년 탄소배출량(톤)' : `페이지형 · /tools/${t.slug ?? t.id}` }))}
        />
        <p className="picker-note">웹 도구의 설명에 「출발점 도구로 쓰기: 가능」이라고 적힌 도구만 나와요.</p>
      </div>
    </Modal>
  );
}
