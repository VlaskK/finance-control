import { createEvent, createStore } from 'effector';
import { useUnit } from 'effector-react';
import { useEffect } from 'react';

// NFR-U2: тост подтверждает действие тем же словом («Добавлено»)

interface Toast {
  id: number;
  text: string;
  kind: 'success' | 'error';
}

const toastShown = createEvent<Toast>();
const toastHidden = createEvent<number>();

let nextId = 0;

const $toasts = createStore<Toast[]>([])
  .on(toastShown, (list, toast) => [...list.slice(-3), toast])
  .on(toastHidden, (list, id) => list.filter((t) => t.id !== id));

export function notify(text: string, kind: 'success' | 'error' = 'success') {
  toastShown({ id: ++nextId, text, kind });
}

function ToastItem({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => toastHidden(toast.id), 3500);
    return () => clearTimeout(timer);
  }, [toast.id]);
  return (
    <div className={`toast toast--${toast.kind}`} role="status">
      {toast.text}
    </div>
  );
}

export function Toaster() {
  const toasts = useUnit($toasts);
  if (!toasts.length) return null;
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
