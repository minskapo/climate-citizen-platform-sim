import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'tint' | 'outline' | 'ghost' | 'danger' | 'dark';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** 둥근 알약 모양(창 아래 버튼 등) */
  pill?: boolean;
  block?: boolean;
}

const cls = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', pill, block, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={cls('btn', `btn-${variant}`, `btn-${size}`, pill && 'btn-pill', block && 'btn-block', className)} {...rest} />;
}

export function ButtonLink({ to, variant = 'primary', size = 'md', pill, block, className, children }: {
  to: string; variant?: Variant; size?: Size; pill?: boolean; block?: boolean; className?: string; children: ReactNode;
}) {
  return <Link to={to} className={cls('btn', `btn-${variant}`, `btn-${size}`, pill && 'btn-pill', block && 'btn-block', className)}>{children}</Link>;
}

type Tone = 'green' | 'solid' | 'gray' | 'yellow' | 'blue' | 'navy' | 'red' | 'outline';

/** 칩. pill은 반경 999, square는 반경 6(시안의 「모집 중」 배지 등). */
export function Chip({ tone = 'gray', square, children, className }: { tone?: Tone; square?: boolean; children: ReactNode; className?: string }) {
  return <span className={cls('chip', `chip-${tone}`, square && 'chip-square', className)}>{children}</span>;
}

export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <As className={cls('card', className)}>{children}</As>;
}

/** 빈 목록 · 준비 중 안내 */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Spinner({ label = '불러오는 중' }: { label?: string }) {
  return <div className="spinner" role="status" aria-label={label} />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}

/** 불러오지 못했을 때: 안내와 다시 시도 */
export function LoadError({ onRetry, text = '불러오지 못했어요' }: { onRetry(): void; text?: string }) {
  return (
    <div className="load-error" role="alert">
      <span>{text}</span>
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>다시 시도</button>
    </div>
  );
}

export { cls };
