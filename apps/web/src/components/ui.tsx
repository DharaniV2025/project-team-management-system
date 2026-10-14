import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Plus, X } from 'lucide-react';
import { errorMessage } from '../api';
import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="page-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="muted page-description">{description}</p>}</div>
      {action && <Link className="button button-primary" to={action.to}><Plus size={16} />{action.label}</Link>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll('_', ' ').toLowerCase();
  return <span className={`status-badge status-${status.toLowerCase()}`}>{label}</span>;
}

export function LoadingState({ label = 'Loading workspace data' }: { label?: string }) {
  return <div className="loading-state"><span className="spinner" />{label}</div>;
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div className="error-state"><AlertCircle size={18} /><span>{errorMessage(error)}</span>{retry && <button className="button button-secondary" onClick={retry}>Try again</button>}</div>;
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: { label: string; to: string } }) {
  return <div className="empty-state"><span className="empty-mark">+</span><h3>{title}</h3><p>{detail}</p>{action && <Link className="button button-primary" to={action.to}>{action.label}</Link>}</div>;
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="section-heading"><h2>{title}</h2>{action}</div>;
}

export function StatCard({ label, value, note, tone = 'green' }: { label: string; value: string | number; note: string; tone?: 'green' | 'coral' | 'amber' | 'blue' }) {
  return <article className={`stat-card stat-${tone}`}><div className="stat-top"><span>{label}</span><i /></div><strong>{value}</strong><p>{note}</p></article>;
}

export function SuccessMessage({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return <div className="success-state" role="status"><CheckCircle2 size={17} /><span>{message}</span>{onDismiss && <button className="icon-button" aria-label="Dismiss success message" onClick={onDismiss}><X size={15} /></button>}</div>;
}