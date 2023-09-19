import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={`btn btn-${variant} ${className}`.trim()} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-header">
          {title && <h2>{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'danger' | 'success' | 'warning'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ErrorNote({ error }: { error: Error | string | null | undefined }) {
  if (!error) return null;
  return (
    <p className="error-note" role="alert">
      {typeof error === 'string' ? error : error.message}
    </p>
  );
}

export function Loading() {
  return <p className="muted">Loading…</p>;
}
