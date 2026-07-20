import {
  GitCompareArrows,
  MoreHorizontal,
  RotateCcw,
  Save,
  FileCog,
  Download,
  Upload,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { ChassisSection } from '../types';

export function ChassisHeader({
  workspaceName,
  vehicleName,
  linkedFileCount,
  unsavedCount,
  blockingErrors,
  sourceEdited,
  onCompare,
  onReviewSave,
  onDiscard,
  onRegenerateMissing,
  onImport,
  onExportAll,
  planning,
}: {
  workspaceName: string;
  vehicleName: string;
  linkedFileCount: number;
  unsavedCount: number;
  blockingErrors: number;
  sourceEdited: boolean;
  onCompare: () => void;
  onReviewSave: () => void;
  onDiscard: () => void;
  onRegenerateMissing: () => void;
  onImport: (files: FileList) => void;
  onExportAll: () => void;
  planning: boolean;
}): React.JSX.Element {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const dirty = unsavedCount > 0 || sourceEdited;

  const statSegments: React.ReactNode[] = [
    `${linkedFileCount} linked file${linkedFileCount === 1 ? '' : 's'}`,
  ];

  if (blockingErrors > 0) {
    statSegments.push(
      <span className="chassis-header-stat is-error" role="status">
        {blockingErrors} blocking error{blockingErrors === 1 ? '' : 's'}
      </span>,
    );
  } else if (unsavedCount > 0) {
    statSegments.push(
      <span className="chassis-header-stat is-warn" role="status">
        {unsavedCount} unsaved
      </span>,
    );
  }

  if (sourceEdited) {
    statSegments.push(<span className="chassis-header-stat is-note">source edited</span>);
  }

  useEffect(() => {
    if (!overflowOpen) return;
    const close = (event: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(event.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [overflowOpen]);

  return (
    <header className="chassis-header index-header">
      <div className="chassis-header-main index-header-main">
        <div className="index-header-titles">
          <h1>Chassis</h1>
        </div>
        <div className="index-header-meta chassis-header-meta">
          <span className="index-header-scope" title={workspaceName}>
            {workspaceName || 'No workspace'}
          </span>
          <span className="index-header-sep" aria-hidden="true">
            /
          </span>
          <code className="index-header-file">{vehicleName}</code>
          <span className="index-header-sep" aria-hidden="true">
            ·
          </span>
          <span className="chassis-header-stats">
            {statSegments.map((segment, index) => (
              <Fragment key={index}>
                {index > 0 ? (
                  <span className="chassis-header-stat-sep" aria-hidden="true">
                    ·
                  </span>
                ) : null}
                {segment}
              </Fragment>
            ))}
          </span>
        </div>
      </div>

      <div className="index-header-controls chassis-header-controls">
        <div className="index-header-actions">
          <button type="button" className="index-action" onClick={onCompare}>
            <GitCompareArrows aria-hidden="true" />
            Compare
          </button>
          <button
            type="button"
            className="index-action primary"
            disabled={planning || (!dirty && unsavedCount === 0)}
            onClick={onReviewSave}
          >
            <Save aria-hidden="true" />
            {planning ? 'Preparing…' : 'Review & save'}
          </button>
          <div className="index-overflow" ref={overflowRef}>
            <button
              type="button"
              className="index-action icon-only"
              aria-label="More actions"
              aria-expanded={overflowOpen}
              onClick={() => setOverflowOpen((open) => !open)}
            >
              <MoreHorizontal aria-hidden="true" />
            </button>
            {overflowOpen ? (
              <menu className="index-overflow-menu">
                <button
                  type="button"
                  onClick={() => {
                    setOverflowOpen(false);
                    onRegenerateMissing();
                  }}
                >
                  <FileCog aria-hidden="true" />
                  Generate missing metadata…
                </button>
                <button type="button" onClick={() => importInputRef.current?.click()}>
                  <Upload aria-hidden="true" />
                  Import .meta files
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".meta,.xml"
                  multiple
                  hidden
                  onChange={(event) => {
                    if (event.target.files?.length) {
                      setOverflowOpen(false);
                      onImport(event.target.files);
                    }
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setOverflowOpen(false);
                    onExportAll();
                  }}
                >
                  <Download aria-hidden="true" />
                  Export all files
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOverflowOpen(false);
                    if (
                      window.confirm(
                        'Discard all unsaved edits? Structured values and source edits revert to the last saved state.',
                      )
                    ) {
                      onDiscard();
                    }
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  Discard changes
                </button>
              </menu>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export function SectionNav({
  section,
  onChange,
  handlingWarnings,
}: {
  section: ChassisSection;
  onChange: (section: ChassisSection) => void;
  handlingWarnings: number;
}): React.JSX.Element {
  const items: { id: ChassisSection; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    ...(handlingWarnings > 0
      ? [{ id: 'handling' as const, label: 'Handling', badge: handlingWarnings }]
      : [{ id: 'handling' as const, label: 'Handling' }]),
    { id: 'vehicle-setup', label: 'Vehicle setup' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'relationships', label: 'Relationships' },
    { id: 'source', label: 'Source' },
  ];

  return (
    <nav className="chassis-section-nav" aria-label="Chassis sections">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={section === item.id ? 'page' : undefined}
          className={section === item.id ? 'is-active' : ''}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.badge ? <span className="chassis-nav-badge">{item.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}
