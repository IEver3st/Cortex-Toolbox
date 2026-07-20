import { useReducedMotion } from '../lib/motion';

export function ProgressBar({
  value,
  label,
  tone = 'primary',
  className = '',
  showLabel = false,
}: {
  value: number;
  label: string;
  tone?: 'primary' | 'neutral' | 'success';
  className?: string;
  showLabel?: boolean;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, value));
  const pct = Math.round(clamped * 100);

  return (
    <div className={`progress-bar progress-bar--${tone}${className ? ` ${className}` : ''}`}>
      <div
        className="progress-bar-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
      >
        <span
          className="progress-bar-fill"
          data-reduced={reduced ? 'true' : undefined}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel ? <span className="progress-bar-label">{label}</span> : null}
    </div>
  );
}
