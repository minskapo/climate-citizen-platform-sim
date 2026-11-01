import { useSyncExternalStore } from 'react';

interface ToastItem { id: number; text: string }

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const TOAST_MS = 1600;

/** 컴포넌트 밖(api 등)에서도 부를 수 있는 짧은 알림. 1.6초 뒤 사라진다. */
export function showToast(text: string) {
  const id = ++seq;
  items = [...items.filter((t) => t.text !== text), { id, text }].slice(-3);
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, TOAST_MS);
}

export function useToast(): (text: string) => void {
  return showToast;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ToastHost() {
  const list = useSyncExternalStore(subscribe, () => items, () => items);
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-check" aria-hidden="true">✓</span>
          {t.text}
        </div>
      ))}
    </div>
  );
}
