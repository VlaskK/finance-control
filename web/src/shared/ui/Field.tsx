import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

// FR-A6 / NFR-U2 — ошибка у поля, в формулировке «что сделать»
export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </label>
  );
}
