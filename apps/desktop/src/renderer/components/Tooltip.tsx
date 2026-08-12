import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  /** Preferred side; flips automatically near viewport edges. */
  side?: TooltipSide;
  /** Hover open delay in ms. Focus opens after a shorter delay. */
  delayMs?: number;
  /** When true, never show the tooltip. */
  disabled?: boolean;
  /** Optional keyboard shortcut shown after the label. */
  shortcut?: string;
  className?: string;
}

function prefersReducedMotion(): boolean {
  if (
    typeof document !== 'undefined' &&
    document.documentElement.dataset.reducedMotion === 'true'
  ) {
    return true;
  }
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function placeTooltip(
  trigger: DOMRect,
  tooltip: DOMRect,
  preferred: TooltipSide,
  gap = 8,
): { top: number; left: number; side: TooltipSide } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const candidates = [preferred, 'top', 'bottom', 'right', 'left'].filter(
    (side, index, list) => list.indexOf(side) === index,
  ) as TooltipSide[];

  for (const side of candidates) {
    let top: number;
    let left: number;
    if (side === 'top') {
      top = trigger.top - tooltip.height - gap;
      left = trigger.left + trigger.width / 2 - tooltip.width / 2;
    } else if (side === 'bottom') {
      top = trigger.bottom + gap;
      left = trigger.left + trigger.width / 2 - tooltip.width / 2;
    } else if (side === 'left') {
      top = trigger.top + trigger.height / 2 - tooltip.height / 2;
      left = trigger.left - tooltip.width - gap;
    } else {
      top = trigger.top + trigger.height / 2 - tooltip.height / 2;
      left = trigger.right + gap;
    }

    left = Math.min(Math.max(8, left), vw - tooltip.width - 8);
    top = Math.min(Math.max(8, top), vh - tooltip.height - 8);

    const fits =
      (side === 'top' && trigger.top - tooltip.height - gap >= 4) ||
      (side === 'bottom' && trigger.bottom + tooltip.height + gap <= vh - 4) ||
      (side === 'left' && trigger.left - tooltip.width - gap >= 4) ||
      (side === 'right' && trigger.right + tooltip.width + gap <= vw - 4);

    if (fits || side === candidates[candidates.length - 1]) {
      return { top, left, side };
    }
  }

  return {
    top: Math.max(8, trigger.top - tooltip.height - gap),
    left: Math.min(Math.max(8, trigger.left), vw - tooltip.width - 8),
    side: preferred,
  };
}

/**
 * Desktop-oriented tooltip. Prefer for icon-only controls, truncated labels,
 * and disabled-action explanations. Avoid restating visible text.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  delayMs = 380,
  disabled = false,
  shortcut,
  className,
}: TooltipProps): React.JSX.Element {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; side: TooltipSide } | null>(
    null,
  );

  const clearTimer = useCallback(() => {
    if (openTimer.current != null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setOpen(false);
    setCoords(null);
  }, [clearTimer]);

  const scheduleOpen = useCallback(
    (ms: number) => {
      if (disabled || content == null || content === false || content === '') return;
      clearTimer();
      openTimer.current = window.setTimeout(() => setOpen(true), ms);
    },
    [clearTimer, content, disabled],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onScroll = () => close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [close, open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tipRef.current) return;
    const next = placeTooltip(
      triggerRef.current.getBoundingClientRect(),
      tipRef.current.getBoundingClientRect(),
      side,
    );
    setCoords(next);
  }, [open, side, content, shortcut]);

  const labeledChild =
    open && !disabled && isValidElement(children)
      ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
          'aria-describedby': [
            (children as ReactElement<{ 'aria-describedby'?: string }>).props['aria-describedby'],
            id,
          ]
            .filter(Boolean)
            .join(' '),
        })
      : children;

  const style: CSSProperties | undefined = coords
    ? { top: coords.top, left: coords.left }
    : { top: -9999, left: -9999, visibility: 'hidden' };

  const tip =
    open && !disabled && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className={[
              'cortex-tooltip',
              coords ? `is-${coords.side}` : 'is-top',
              prefersReducedMotion() ? 'is-instant' : '',
              className ?? '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={style}
            data-side={coords?.side ?? side}
          >
            <span className="cortex-tooltip-label">{content}</span>
            {shortcut ? <kbd className="cortex-tooltip-shortcut">{shortcut}</kbd> : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={triggerRef}
        className="cortex-tooltip-anchor"
        onMouseEnter={() => scheduleOpen(delayMs)}
        onMouseLeave={close}
        onFocusCapture={() => scheduleOpen(Math.min(delayMs, 160))}
        onBlurCapture={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next && triggerRef.current?.contains(next)) return;
          close();
        }}
      >
        {labeledChild}
      </span>
      {tip}
    </>
  );
}
