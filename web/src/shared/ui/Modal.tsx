import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export function Modal({ title, onClose, children, width = 480 }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // фокус внутрь диалога (NFR-A1)
    const focusable = ref.current?.querySelector<HTMLElement>(
      'input, select, textarea, button',
    );
    focusable?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }} ref={ref}>
        <div className="modal__header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// FR-B3 — подтверждение перед необратимым действием
export function ConfirmDialog({ title, text, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  return (
    <Modal title={title} onClose={onClose} width={400}>
      <p className="confirm-text">{text}</p>
      <div className="modal__actions">
        <button type="button" className="btn" onClick={onClose}>
          Отмена
        </button>
        <button
          type="button"
          className={danger ? 'btn btn--danger' : 'btn btn--primary'}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
