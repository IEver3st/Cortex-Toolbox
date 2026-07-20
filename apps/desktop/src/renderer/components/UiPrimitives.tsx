import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { brandIconUrl } from '../lib/brand-icon';
import { usePreferences } from '../hooks/usePreferences';

export function CortexMark({ size = 'medium' }: { size?: 'small' | 'medium' | 'large' }) {
  const preferences = usePreferences();

  return (
    <img
      className={`cortex-mark ${size}`}
      src={brandIconUrl(preferences.data?.releaseBranch ?? 'stable')}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

/** Compact sticky command strip for in-page context and actions. */
export function PageHeader({
  context,
  actions,
  sticky = false,
  className = '',
}: {
  /** Optional left-side context (scope, counts, status copy). Avoid empty-left toolbars. */
  context?: ReactNode;
  actions?: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  if (!actions && !context) return null;
  return (
    <header
      className={`page-header page-header-toolbar${sticky ? ' is-sticky' : ''}${className ? ` ${className}` : ''}`}
    >
      {context && <div className="page-header-context">{context}</div>}
      {actions && <div className="page-header-aside">{actions}</div>}
    </header>
  );
}

export function Toggle({
  id,
  name,
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  id: string;
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <span className="toggle-control">
      <input
        id={id}
        name={name}
        type="checkbox"
        className="toggle-input"
        role="switch"
        aria-label={ariaLabel}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state${compact ? ' compact' : ''}`}>
      <Icon aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
