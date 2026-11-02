import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { cls } from '../../../components/ui';

/** 필드 오류(API 400 INVALID_SETTINGS의 field → 문구) */
export const ErrorsContext = createContext<Record<string, string>>({});

export function FieldError({ name }: { name: string | string[] }) {
  const errors = useContext(ErrorsContext);
  const names = Array.isArray(name) ? name : [name];
  const msg = names.map((n) => errors[n] ?? Object.entries(errors).find(([k]) => k.startsWith(`${n}.`) || k.startsWith(`${n}[`))?.[1]).find(Boolean);
  if (!msg) return null;
  return <span className="field-error" role="alert">{msg}</span>;
}

export function useHasError(name: string): boolean {
  return !!useContext(ErrorsContext)[name];
}

/** 번호가 붙은 설정 묶음. note는 어느 사용자 화면에 반영되는지 알려 주는 회색 글. */
export function Section({ n, title, note, children, id }: { n: number; title: string; note?: string; children: ReactNode; id?: string }) {
  return (
    <section className="ed-sec card" id={id} aria-labelledby={`sec-${n}`}>
      <header className="ed-sec-head">
        <span className="ed-sec-n" aria-hidden="true">{n}</span>
        <h2 id={`sec-${n}`} className="ed-sec-title">{title}</h2>
        {note && <span className="ed-sec-note">{note}</span>}
      </header>
      <div className="ed-sec-body">{children}</div>
    </section>
  );
}

export function Row({ label, children, hint, error, htmlFor }: { label: string; children: ReactNode; hint?: ReactNode; error?: string | string[]; htmlFor?: string }) {
  return (
    <div className="ed-row">
      {htmlFor ? <label className="ed-label" htmlFor={htmlFor}>{label}</label> : <span className="ed-label">{label}</span>}
      {children}
      {error && <FieldError name={error} />}
      {hint && <p className="ed-hint">{hint}</p>}
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={cls('tgl', on && 'is-on')} onClick={() => onChange(!on)}
    >
      <span className="tgl-knob" />
    </button>
  );
}

/** 회색 바탕 줄: 제목 · 설명 · 오른쪽 스위치 */
export function ToggleRow({ title, desc, on, onChange, extra, children, error }: {
  title: string; desc?: ReactNode; on: boolean; onChange(v: boolean): void; extra?: ReactNode; children?: ReactNode; error?: string;
}) {
  return (
    <div className="ed-trow">
      <div className="ed-trow-main">
        <div className="ed-trow-text">
          <p className="ed-trow-title">{title}</p>
          {desc && <p className="ed-trow-desc">{desc}</p>}
        </div>
        {extra}
        <Toggle on={on} onChange={onChange} label={title} />
      </div>
      {error && <FieldError name={error} />}
      {children}
    </div>
  );
}

/** 하나만 고르는 칩 묶음 */
export function ChipGroup<T extends string>({ label, value, options, onChange, disabledValues = [] }: {
  label: string; value: T; options: Array<[T, string]>; onChange(v: T): void; disabledValues?: T[];
}) {
  return (
    <div className="ed-chips" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v} type="button" className={cls('ed-chip', value === v && 'is-on')} aria-pressed={value === v}
          disabled={disabledValues.includes(v)} onClick={() => onChange(v)}
        >{text}</button>
      ))}
    </div>
  );
}

/** 여러 개를 고르는 칩 묶음 */
export function MultiChips<T extends string>({ label, values, options, onChange, fixed = [] }: {
  label: string; values: T[]; options: Array<[T, string]>; onChange(v: T[]): void; fixed?: T[];
}) {
  return (
    <div className="ed-chips" role="group" aria-label={label}>
      {options.map(([v, text]) => {
        const on = values.includes(v);
        return (
          <button
            key={v} type="button" className={cls('ed-chip', on && 'is-on')} aria-pressed={on} disabled={fixed.includes(v)}
            onClick={() => onChange(on ? values.filter((x) => x !== v) : [...values, v])}
          >{text}</button>
        );
      })}
    </div>
  );
}

export function Counter({ value, max }: { value: string; max: number }) {
  return <span className="ed-count">{[...value].length} / {max}</span>;
}

/** 고르기 버튼(▾) — 창을 연다 */
export function PickButton({ label, text, onClick, error }: { label: string; text: string; onClick(): void; error?: boolean }) {
  return (
    <button type="button" className={cls('input ed-pick', error && 'is-error')} aria-label={label} onClick={onClick}>
      <span>{text}</span><span aria-hidden="true">▾</span>
    </button>
  );
}
