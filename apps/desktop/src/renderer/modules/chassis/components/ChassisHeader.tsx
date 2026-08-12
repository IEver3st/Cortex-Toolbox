import type { HandlingDocumentEntry } from '@cortex/vehicle-meta';
import {
  BrainCircuit,
  FileCog,
  FolderOpen,
  GitCompareArrows,
  MoreHorizontal,
  RotateCcw,
  Save,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Select } from '../../../components/Select';
import type { ChassisSection } from '../types';

function savedTimeLabel(savedAt: Date | null): string {
  if (!savedAt) return 'Loaded from disk';
  return `Saved ${savedAt.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

export function ChassisHeader({
  workspaceName,
  activePath,
  handlingPaths,
  entries,
  selectedEntryId,
  dirty,
  saving,
  blockingErrors,
  savedAt,
  onFileChange,
  onEntryChange,
  onCompare,
  onSave,
  onDiscard,
  onGenerateMetadata,
  onOpenFile,
  aiEnabled,
  onAskAi,
}: {
  workspaceName: string;
  activePath: string;
  handlingPaths: string[];
  entries: HandlingDocumentEntry[];
  selectedEntryId: string;
  dirty: boolean;
  saving: boolean;
  blockingErrors: number;
  savedAt: Date | null;
  onFileChange: (relativePath: string) => void;
  onEntryChange: (entryId: string) => void;
  onCompare: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onGenerateMetadata: () => void;
  onOpenFile: () => void;
  aiEnabled: boolean;
  onAskAi: (prompt: string) => void;
}): React.JSX.Element {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);

  useEffect(() => {
    if (!overflowOpen) return;
    const close = (event: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(event.target as Node)) {
        setOverflowOpen(false);
      }
    };
    globalThis.document.addEventListener('mousedown', close);
    return () => globalThis.document.removeEventListener('mousedown', close);
  }, [overflowOpen]);

  return (
    <header className="chassis-header index-header chassis-file-header">
      <div className="chassis-file-context">
        <span className="chassis-workspace-name" title={workspaceName}>
          {workspaceName}
        </span>
        <div className="chassis-file-selectors">
          <label>
            <span>File</span>
            {handlingPaths.length > 1 ? (
              <Select
                id="chassis-handling-file"
                ariaLabel="Handling file"
                value={activePath}
                options={handlingPaths.map((path) => ({ value: path, label: path }))}
                onChange={onFileChange}
              />
            ) : (
              <code title={activePath}>{activePath}</code>
            )}
          </label>
          <span className="chassis-context-separator" aria-hidden="true">
            ·
          </span>
          <label>
            <span>Entry</span>
            {entries.length > 1 ? (
              <Select
                id="chassis-handling-entry"
                ariaLabel="Handling entry"
                value={selectedEntryId}
                options={entries.map((entry) => ({
                  value: entry.id,
                  label: entry.handlingName,
                }))}
                onChange={onEntryChange}
              />
            ) : (
              <code>{selectedEntry?.handlingName ?? 'Unknown entry'}</code>
            )}
          </label>
        </div>
      </div>

      <div className="chassis-header-controls">
        <span
          className={`chassis-save-state${blockingErrors > 0 ? ' is-error' : dirty ? ' is-dirty' : ' is-saved'}`}
          role="status"
        >
          <span aria-hidden="true" />
          {blockingErrors > 0
            ? `${blockingErrors} validation issue${blockingErrors === 1 ? '' : 's'}`
            : dirty
              ? 'Modified'
              : savedTimeLabel(savedAt)}
        </span>
        <div className="index-header-actions">
          {aiEnabled ? (
            <button
              type="button"
              className="index-action"
              onClick={() =>
                onAskAi(
                  'Diagnose the active handling entry. Inspect stability, centre of mass, inertia, suspension, anti-roll, roll centres, and traction relationships before proposing coherent changes.',
                )
              }
            >
              <BrainCircuit aria-hidden="true" />
              Diagnose
            </button>
          ) : null}
          <button type="button" className="index-action" disabled={!dirty} onClick={onDiscard}>
            <RotateCcw aria-hidden="true" />
            Reset
          </button>
          <button type="button" className="index-action" onClick={onCompare}>
            <GitCompareArrows aria-hidden="true" />
            Compare
          </button>
          <button
            type="button"
            className="index-action primary"
            disabled={!dirty || saving || blockingErrors > 0}
            title={
              blockingErrors > 0 ? 'Resolve validation issues before saving.' : 'Save (Ctrl+S)'
            }
            onClick={onSave}
          >
            <Save aria-hidden="true" />
            {saving ? 'Saving…' : 'Save'}
          </button>
          <div className="index-overflow" ref={overflowRef}>
            <button
              type="button"
              className="index-action icon-only"
              aria-label="More Chassis actions"
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
                    onOpenFile();
                  }}
                >
                  <FolderOpen aria-hidden="true" />
                  Open handling file…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOverflowOpen(false);
                    onGenerateMetadata();
                  }}
                >
                  <FileCog aria-hidden="true" />
                  Create vehicle metadata…
                </button>
                {aiEnabled ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setOverflowOpen(false);
                        onAskAi(
                          'Improve the stability of the active handling entry while preserving its intended vehicle character. Explain the interacting changes.',
                        );
                      }}
                    >
                      <BrainCircuit aria-hidden="true" />
                      Improve stability
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOverflowOpen(false);
                        onAskAi(
                          'Analyse and tune the suspension of the active handling entry as a coherent system.',
                        );
                      }}
                    >
                      <BrainCircuit aria-hidden="true" />
                      Tune suspension
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOverflowOpen(false);
                        onAskAi(
                          'Analyse the traction relationships in the active handling entry and identify likely handling problems.',
                        );
                      }}
                    >
                      <BrainCircuit aria-hidden="true" />
                      Analyse traction
                    </button>
                  </>
                ) : null}
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
  editingExisting = false,
}: {
  section: ChassisSection;
  onChange: (section: ChassisSection) => void;
  editingExisting?: boolean;
}): React.JSX.Element {
  const items: { id: ChassisSection; label: string }[] = editingExisting
    ? [
        { id: 'handling', label: 'Handling' },
        { id: 'source', label: 'Source' },
      ]
    : [
        { id: 'overview', label: 'Overview' },
        { id: 'handling', label: 'Handling' },
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
        </button>
      ))}
    </nav>
  );
}
