import { Check, MoreHorizontal, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DocumentStatus, ManifestView } from './manifest-utils';
import { statusLabel } from './manifest-utils';

export interface ManifestHeaderProps {
  workspaceName: string;
  manifestName: string;
  status: DocumentStatus;
  view: ManifestView;
  dirty: boolean;
  validating: boolean;
  planning: boolean;
  onViewChange: (view: ManifestView) => void;
  onValidate: () => void;
  onReviewSave: () => void;
  onDiscard: () => void;
}

function statusClass(status: DocumentStatus): string {
  switch (status) {
    case 'saved':
    case 'valid':
      return 'is-valid';
    case 'unsaved':
      return 'is-dirty';
    case 'needs-review':
      return 'is-review';
    case 'invalid':
      return 'is-invalid';
  }
}

export function ManifestHeader({
  workspaceName,
  manifestName,
  status,
  view,
  dirty,
  validating,
  planning,
  onViewChange,
  onValidate,
  onReviewSave,
  onDiscard,
}: ManifestHeaderProps): React.JSX.Element {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

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

  const handleDiscard = () => {
    setOverflowOpen(false);
    if (
      window.confirm(
        'Discard all unsaved edits? This cannot be undone unless you reload from disk.',
      )
    ) {
      onDiscard();
    }
  };

  return (
    <header className="index-header">
      <div className="index-header-main">
        <div className="index-header-titles">
          <h1>Index</h1>
          <p className="index-header-subtitle">Edit and validate the resource manifest.</p>
        </div>
        <div className="index-header-meta">
          <span className="index-header-scope" title={workspaceName}>
            {workspaceName}
          </span>
          <span className="index-header-sep" aria-hidden="true">
            /
          </span>
          <code className="index-header-file">{manifestName}</code>
          <span className="index-header-sep" aria-hidden="true">
            ·
          </span>
          <span className={`index-doc-status ${statusClass(status)}`} role="status">
            {dirty && status !== 'unsaved' ? 'Unsaved' : statusLabel(status)}
          </span>
        </div>
      </div>

      <div className="index-header-controls">
        <div className="segmented index-view-toggle" role="tablist" aria-label="Editor view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'source'}
            className={view === 'source' ? 'active' : ''}
            onClick={() => onViewChange('source')}
          >
            Source
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'structured'}
            className={view === 'structured' ? 'active' : ''}
            onClick={() => onViewChange('structured')}
          >
            Structured
          </button>
        </div>

        <div className="index-header-actions">
          <button type="button" className="index-action" disabled={validating} onClick={onValidate}>
            <ShieldCheck aria-hidden="true" />
            {validating ? 'Validating…' : 'Validate'}
          </button>

          {dirty ? (
            <>
              <button
                type="button"
                className="index-action primary"
                disabled={planning}
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
                    <button type="button" onClick={handleDiscard}>
                      <RotateCcw aria-hidden="true" />
                      Discard changes
                    </button>
                  </menu>
                ) : null}
              </div>
            </>
          ) : (
            <span className="index-saved-state" role="status">
              <Check aria-hidden="true" />
              Saved
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
