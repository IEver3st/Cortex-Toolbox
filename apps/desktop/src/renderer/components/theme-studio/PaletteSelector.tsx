import { Check, ChevronDown, Copy, Download, Pencil, Trash2, Upload } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { isBuiltinPaletteId } from '../../../shared/theme-schema';
import { BUILTIN_PALETTE_META } from '../../lib/theme/builtins';

export interface PaletteOption {
  id: string;
  name: string;
  description?: string | undefined;
  source: 'builtin' | 'custom' | 'imported';
  modeSupport: 'light' | 'dark' | 'dual';
  swatches: string[];
  group: 'cortex' | 'mine' | 'imported';
}

export function PaletteSelector({
  value,
  options,
  statusLabel,
  onSelect,
  onDuplicate,
  onRename,
  onExport,
  onDelete,
  onImport,
}: {
  value: string;
  options: PaletteOption[];
  statusLabel?: string | undefined;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
}): React.JSX.Element {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.id === value) ?? options[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.name} ${option.description ?? ''}`.toLowerCase().includes(needle),
    );
  }, [options, query]);

  const groups = useMemo(
    () =>
      [
        { key: 'cortex', label: 'Cortex palettes' },
        { key: 'mine', label: 'My palettes' },
        { key: 'imported', label: 'Imported palettes' },
      ] as const,
    [],
  );

  const flatOptions = useMemo(
    () =>
      groups.flatMap((group) =>
        filtered
          .filter((option) => option.group === group.key)
          .map((option) => ({ ...option, groupLabel: group.label })),
      ),
    [filtered, groups],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setCoords(null);
    triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 360) });
  }, [open, flatOptions.length]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('mousedown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [close, open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % Math.max(flatOptions.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(
        (current) =>
          (current - 1 + Math.max(flatOptions.length, 1)) % Math.max(flatOptions.length, 1),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = flatOptions[activeIndex];
      if (option) {
        onSelect(option.id);
        close();
      }
    }
  };

  const canManage = selected && !isBuiltinPaletteId(selected.id);

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="theme-palette-menu"
            style={
              coords ? { top: coords.top, left: coords.left, minWidth: coords.width } : undefined
            }
            onKeyDown={onMenuKeyDown}
          >
            <div className="theme-palette-menu-search">
              <input
                type="search"
                placeholder="Search palettes"
                value={query}
                autoFocus
                aria-label="Search palettes"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
              />
            </div>
            <div className="theme-palette-menu-list" role="listbox" aria-label="Palettes">
              {groups.map((group) => {
                const items = flatOptions.filter((option) => option.group === group.key);
                if (items.length === 0) return null;
                return (
                  <div key={group.key} className="theme-palette-menu-group">
                    <p>{group.label}</p>
                    {items.map((option, index) => (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={option.id === value}
                        className={[
                          'theme-palette-option',
                          option.id === value ? 'is-selected' : '',
                          index === activeIndex ? 'is-active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => {
                          onSelect(option.id);
                          close();
                        }}
                      >
                        <span className="theme-palette-swatches" aria-hidden="true">
                          {option.swatches.map((swatch) => (
                            <i key={swatch} style={{ backgroundColor: swatch }} />
                          ))}
                        </span>
                        <span className="theme-palette-option-copy">
                          <strong>{option.name}</strong>
                          <small>
                            {option.source === 'builtin'
                              ? 'Built-in'
                              : option.source === 'imported'
                                ? 'Imported'
                                : 'Custom'}
                            {' · '}
                            {option.modeSupport === 'dual'
                              ? 'Light & dark'
                              : option.modeSupport === 'light'
                                ? 'Light'
                                : 'Dark'}
                          </small>
                        </span>
                        {option.id === value ? <Check aria-hidden="true" /> : null}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="theme-palette-menu-actions">
              <button type="button" onClick={onImport}>
                <Upload aria-hidden="true" /> Import JSON
              </button>
              {selected ? (
                <>
                  <button type="button" onClick={() => onDuplicate(selected.id)}>
                    <Copy aria-hidden="true" /> Duplicate
                  </button>
                  <button type="button" disabled={!canManage} onClick={() => onRename(selected.id)}>
                    <Pencil aria-hidden="true" /> Rename
                  </button>
                  <button type="button" onClick={() => onExport(selected.id)}>
                    <Download aria-hidden="true" /> Export
                  </button>
                  <button
                    type="button"
                    className="is-destructive"
                    disabled={!canManage}
                    onClick={() => onDelete(selected.id)}
                  >
                    <Trash2 aria-hidden="true" /> Delete
                  </button>
                </>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="theme-palette-selector">
      <div className="theme-palette-selector-head">
        <span id={`${id}-label`} className="theme-section-label">
          Palette
        </span>
        {statusLabel ? <span className="theme-palette-status">{statusLabel}</span> : null}
      </div>
      <button
        ref={triggerRef}
        type="button"
        className="theme-palette-trigger"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="theme-palette-swatches" aria-hidden="true">
          {(selected?.swatches ?? BUILTIN_PALETTE_META.at(0)?.swatches ?? []).map((swatch) => (
            <i key={swatch} style={{ backgroundColor: swatch }} />
          ))}
        </span>
        <span className="theme-palette-trigger-copy">
          <strong>{selected?.name ?? 'Everforest'}</strong>
          <small>
            {selected?.description}
            {' · Browse, import, or manage palettes'}
          </small>
        </span>
        <ChevronDown aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}
