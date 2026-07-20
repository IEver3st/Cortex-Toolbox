import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Visual separator before this item. */
  separator?: boolean;
  onSelect?: () => void;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  children: ReactNode;
  /** Optional label announced to assistive tech. */
  label?: string;
  disabled?: boolean;
  /** When true, left-click on the trigger toggles the menu (anchored below). */
  triggerOnClick?: boolean;
  onOpenChange?: (open: boolean) => void;
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

function placeMenu(
  x: number,
  y: number,
  width: number,
  height: number,
): { top: number; left: number } {
  const pad = 8;
  const left = Math.min(Math.max(pad, x), window.innerWidth - width - pad);
  const top = Math.min(Math.max(pad, y), window.innerHeight - height - pad);
  return { top, left };
}

/**
 * Context menu for desktop work surfaces. Opens on right-click by default;
 * pass `triggerOnClick` to also toggle from a left-click on the trigger.
 * Closes on Escape, outside pointer, scroll, and item selection.
 */
export function ContextMenu({
  items,
  children,
  label = 'Context menu',
  disabled = false,
  triggerOnClick = false,
  onOpenChange,
  className,
}: ContextMenuProps): React.JSX.Element {
  const menuId = useId();
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const [anchor, setAnchor] = useState<'pointer' | 'trigger'>('pointer');
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const enabledIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.disabled)
    .map(({ index }) => index);

  const setMenuOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
      if (!next) setCoords(null);
    },
    [onOpenChange],
  );

  const openAt = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled || items.length === 0) return;
      setAnchor('pointer');
      setPoint({ x: clientX, y: clientY });
      setActiveIndex(enabledIndexes[0] ?? 0);
      setMenuOpen(true);
    },
    [disabled, enabledIndexes, items.length, setMenuOpen],
  );

  const openAtTrigger = useCallback(() => {
    if (disabled || items.length === 0) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor('trigger');
    setPoint({ x: rect.right, y: rect.bottom + 4 });
    setActiveIndex(enabledIndexes[0] ?? 0);
    setMenuOpen(true);
  }, [disabled, enabledIndexes, items.length, setMenuOpen]);

  const close = useCallback(() => setMenuOpen(false), [setMenuOpen]);

  const runItem = useCallback(
    (item: ContextMenuItem) => {
      if (item.disabled) return;
      close();
      window.setTimeout(() => item.onSelect?.(), 0);
    },
    [close],
  );

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (anchor === 'trigger') {
      const pad = 8;
      const left = Math.min(
        Math.max(pad, point.x - rect.width),
        window.innerWidth - rect.width - pad,
      );
      const top = Math.min(point.y, window.innerHeight - rect.height - pad);
      setCoords({ top, left });
    } else {
      setCoords(placeMenu(point.x, point.y, rect.width, rect.height));
    }
  }, [anchor, open, point.x, point.y, items]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        const focusable = triggerRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        focusable?.focus();
      }
    };
    const onScroll = () => close();
    window.addEventListener('mousedown', onPointer, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('mousedown', onPointer, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const active = menuRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    active?.focus();
  }, [activeIndex, open]);

  const onContextMenu = (event: ReactMouseEvent) => {
    if (disabled || items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    openAt(event.clientX, event.clientY);
  };

  const onTriggerClick = (event: ReactMouseEvent) => {
    if (!triggerOnClick || disabled || items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (open) close();
    else openAtTrigger();
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (disabled || items.length === 0) return;
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) openAt(rect.left + 8, rect.bottom);
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent) => {
    if (!enabledIndexes.length) return;
    const currentPos = Math.max(0, enabledIndexes.indexOf(activeIndex));
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(enabledIndexes[(currentPos + 1) % enabledIndexes.length] ?? 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(
        enabledIndexes[(currentPos - 1 + enabledIndexes.length) % enabledIndexes.length] ?? 0,
      );
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(enabledIndexes[0] ?? 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? 0);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) runItem(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      close();
    }
  };

  const style: CSSProperties | undefined = coords
    ? { top: coords.top, left: coords.left }
    : { top: -9999, left: -9999, visibility: 'hidden' };

  const menu: ReactNode =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className={['cortex-context-menu', prefersReducedMotion() ? 'is-instant' : '']
              .filter(Boolean)
              .join(' ')}
            style={style}
            onKeyDown={onMenuKeyDown}
            onContextMenu={(event) => event.preventDefault()}
          >
            {items.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="cortex-context-menu-group">
                  {item.separator ? (
                    <div className="cortex-context-menu-separator" role="separator" />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    data-index={index}
                    className={[
                      'cortex-context-menu-item',
                      item.danger ? 'is-danger' : '',
                      index === activeIndex ? 'is-active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={item.disabled}
                    tabIndex={index === activeIndex ? 0 : -1}
                    onMouseEnter={() => {
                      if (!item.disabled) setActiveIndex(index);
                    }}
                    onClick={() => runItem(item)}
                  >
                    <span className="cortex-context-menu-icon" aria-hidden="true">
                      {Icon ? <Icon /> : null}
                    </span>
                    <span className="cortex-context-menu-label">{item.label}</span>
                    {item.shortcut ? (
                      <kbd className="cortex-context-menu-shortcut">{item.shortcut}</kbd>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={triggerRef}
        className={['cortex-context-trigger', className].filter(Boolean).join(' ')}
        onContextMenu={onContextMenu}
        onClick={onTriggerClick}
        onKeyDown={onKeyDown}
      >
        {children}
      </span>
      {menu}
    </>
  );
}
