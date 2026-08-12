import { LoaderCircle } from 'lucide-react';
import { forwardRef, useCallback, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ActionButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'onClick'
> & {
  children: ReactNode;
  /** When true, shows a spinner, locks the control, and ignores further clicks. */
  busy?: boolean;
  /** Label shown while busy. Defaults to children. */
  busyLabel?: ReactNode;
  /** Optional leading icon (hidden while busy if busyIcon is used). */
  icon?: ReactNode;
  /** Icon while busy; defaults to a spinning loader. */
  busyIcon?: ReactNode;
  variant?: 'default' | 'primary' | 'text' | 'compact';
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
};

/**
 * Primary action control with busy-state lock and gentle press feedback.
 * Prevents double-submit flicker when users spam Run / Run again.
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  {
    children,
    busy = false,
    busyLabel,
    icon,
    busyIcon,
    variant = 'default',
    disabled,
    className = '',
    onClick,
    type = 'button',
    ...rest
  },
  ref,
) {
  const lockRef = useRef(false);
  const isDisabled = disabled === true || busy;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled || lockRef.current || !onClick) return;
      lockRef.current = true;
      try {
        const result = onClick(event);
        if (result) {
          void result.finally(() => {
            lockRef.current = false;
          });
        } else {
          // Sync handlers: release on next frame so rapid re-entry is blocked
          // for the same event tick even if parent has not flipped `busy` yet.
          requestAnimationFrame(() => {
            lockRef.current = false;
          });
        }
      } catch (error) {
        lockRef.current = false;
        throw error;
      }
    },
    [isDisabled, onClick],
  );

  const classes = [
    variant === 'primary' ? 'primary' : '',
    variant === 'text' ? 'text-button' : '',
    variant === 'compact' ? 'compact' : '',
    busy ? 'is-busy' : '',
    'action-button',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const label = busy && busyLabel != null ? busyLabel : children;
  const leading = busy
    ? (busyIcon ?? <LoaderCircle className="action-button-spinner" aria-hidden="true" />)
    : icon;

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      aria-disabled={isDisabled || undefined}
      onClick={handleClick}
      {...rest}
    >
      {leading}
      <span className="action-button-label">{label}</span>
    </button>
  );
});
