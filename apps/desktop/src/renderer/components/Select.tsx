import { Check, ChevronDown } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

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

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  id: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}): React.JSX.Element {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value) ?? options[0];
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const close = useCallback(() => {
    setOpen(false);
    setCoords(null);
    triggerRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    if (disabled || options.length === 0) return;
    setActiveIndex(selectedIndex);
    setOpen(true);
  }, [disabled, options.length, selectedIndex]);

  const selectOption = useCallback(
    (next: T) => {
      onChange(next);
      close();
    },
    [close, onChange],
  );

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const pad = 8;
    const gap = 4;
    let top = triggerRect.bottom + gap;
    let left = triggerRect.left;
    const width = triggerRect.width;

    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      if (top + menuRect.height > window.innerHeight - pad) {
        top = Math.max(pad, triggerRect.top - menuRect.height - gap);
      }
      if (left + menuRect.width > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - menuRect.width - pad);
      }
    }

    setCoords({ top, left, width });
  }, [open, options]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
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

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      if (event.key === 'ArrowDown') {
        setActiveIndex((current) => (current + 1) % options.length);
      } else if (event.key === 'ArrowUp') {
        setActiveIndex((current) => (current - 1 + options.length) % options.length);
      }
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + options.length) % options.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) selectOption(option.value);
    } else if (event.key === 'Tab') {
      close();
    }
  };

  const menuStyle: CSSProperties | undefined = coords
    ? { top: coords.top, left: coords.left, minWidth: coords.width }
    : { top: -9999, left: -9999, visibility: 'hidden' };

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabel ? undefined : `${id}-label`}
            className={['settings-select-menu', prefersReducedMotion() ? 'is-instant' : '']
              .filter(Boolean)
              .join(' ')}
            style={menuStyle}
            onKeyDown={onMenuKeyDown}
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                data-index={index}
                aria-selected={option.value === value}
                className={[
                  'settings-select-option',
                  option.value === value ? 'is-selected' : '',
                  index === activeIndex ? 'is-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                tabIndex={index === activeIndex ? 0 : -1}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option.value)}
              >
                <span>{option.label}</span>
                {option.value === value ? <Check aria-hidden="true" /> : null}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="settings-select-wrap">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="settings-select settings-select-trigger"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : `${id}-label`}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="settings-select-value">{selected?.label}</span>
        <ChevronDown className="settings-select-chevron" aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}
