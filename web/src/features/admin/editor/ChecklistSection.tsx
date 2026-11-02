import { useState } from 'react';
import { Chip } from '../../../components/ui';
import { ChecklistItemModal } from '../modals/ChecklistItem';
import { useEditor } from './context';
import { autoChecklist, type CustomItem } from './model';
import { FieldError, Section } from './parts';

const LINK_LABEL: Record<CustomItem['linkType'], string> = { post: '게시판 글', tool: '도구', url: '외부 링크' };

/** 5. 시작 전 체크리스트 / 서명 후 안내 / 모임 전 체크리스트: 자동 항목 + 운영자가 넣는 항목 */
export function ChecklistSection({ title, note, lead }: { title: string; note: string; lead: string }) {
  const ed = useEditor();
  const [open, setOpen] = useState(false);
  const auto = autoChecklist(ed.draft, ed.missions.length, ed.files.length + ed.linkedTools.length);
  const targetText = (c: CustomItem) => {
    if (c.targetLabel) return c.targetLabel;
    if (c.linkType === 'tool') return ed.toolName(c.target);
    if (c.linkType === 'url') return c.target;
    return '캠페인 게시판 글';
  };

  return (
    <Section n={5} title={title} note={note}>
      <p className="ed-hint ed-hint-top">{lead}</p>
      <ul className="ed-list">
        {auto.map((a) => (
          <li key={a.label} className={`ed-li${a.active ? '' : ' is-off'}`}>
            <Chip tone="green" square>자동</Chip>
            <span className="ed-li-title">{a.label}</span>
            <span className="ed-li-side">{a.when}</span>
          </li>
        ))}
        {ed.custom.map((c, i) => (
          <li key={`${c.label}-${i}`} className="ed-li ed-li-custom">
            <Chip tone="yellow" square>추가</Chip>
            <span className="ed-li-title">{c.label}</span>
            <span className="ed-li-side">링크: {LINK_LABEL[c.linkType]} · {targetText(c)}</span>
            <button type="button" className="ed-link-btn" onClick={() => void ed.saveCustom(ed.custom.filter((_, j) => j !== i))}>삭제</button>
          </li>
        ))}
      </ul>
      <FieldError name="checklist" />
      {ed.custom.length < 10 && (
        <button type="button" className="ed-add" onClick={() => setOpen(true)}>+ 항목 추가 (문구 + 링크)</button>
      )}
      {open && (
        <ChecklistItemModal
          title={`${title} 항목 추가`}
          onClose={() => setOpen(false)}
          onAdd={async (item) => {
            const ok = await ed.saveCustom([...ed.custom, item]);
            if (ok) setOpen(false);
            return ok;
          }}
        />
      )}
    </Section>
  );
}
