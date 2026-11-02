import type { ReactNode } from 'react';

export interface PickItem { id: string; name: string; sub?: ReactNode }

/** 창 안 고르기 목록: 고른 줄은 초록 바탕 + ✓ */
export function PickList({ items, selected, onSelect, label, empty }: {
  items: PickItem[]; selected: string[]; onSelect(id: string): void; label: string; empty?: ReactNode;
}) {
  return (
    <div className="picker-list" role="listbox" aria-label={label} aria-multiselectable={selected.length > 1 || undefined}>
      {items.length === 0 && empty}
      {items.map((it) => {
        const on = selected.includes(it.id);
        return (
          <button key={it.id} type="button" role="option" aria-selected={on} className={`picker-item${on ? ' is-current' : ''}`} onClick={() => onSelect(it.id)}>
            <span className="picker-main">
              <span className="picker-name">{it.name}</span>
              {it.sub && <span className="picker-sub">{it.sub}</span>}
            </span>
            {on && <span className="picker-tag" aria-hidden="true">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
