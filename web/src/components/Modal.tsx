import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  open: boolean;
  onClose(): void;
  title: string;
  /** 제목 아래 한 줄 설명 */
  description?: ReactNode;
  children?: ReactNode;
  /** 아래 버튼 줄. 보통 <Button variant="ghost">취소</Button> + 주 버튼 */
  footer?: ReactNode;
  /** 되돌리기 어려운 동작(빨간 버튼)을 담은 창 */
  danger?: boolean;
  width?: number;
  /** 데스크탑에서도 아래 시트로 */
  sheet?: boolean;
}

/** 창(모달). ✕ · 취소 · 바깥 · Esc로 닫힌다. 767px 이하에서는 아래에서 올라오는 시트. */
export function Modal({ open, onClose, title, description, children, footer, danger, width = 520, sheet }: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-x)');
    (first ?? panel.current)?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={`modal-backdrop${sheet ? ' modal-backdrop-sheet' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        className={`modal${danger ? ' modal-danger' : ''}${sheet ? ' modal-sheet' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ maxWidth: width }}
      >
        <div className="modal-grip" aria-hidden="true" />
        <div className="modal-head">
          <div>
            <h2 id={titleId} className="modal-title">{title}</h2>
            {description && <p className="modal-desc">{description}</p>}
          </div>
          <button type="button" className="modal-x" aria-label="닫기" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** 어느 폭에서나 아래에서 올라오는 시트. */
export function Sheet(props: Omit<ModalProps, 'sheet'>) {
  return <Modal {...props} sheet />;
}
