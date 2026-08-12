import { ExternalLink } from 'lucide-react';
import type { ParsedManifest } from '@cortex/resource-parser/manifest';
import { patchStructuredField } from './manifest-patch';

interface FieldProps {
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onEditInSource?: () => void;
}

function StructuredField({
  label,
  value,
  readOnly = false,
  onChange,
  onEditInSource,
}: FieldProps): React.JSX.Element {
  return (
    <label className="index-structured-field">
      <span>{label}</span>
      {readOnly ? (
        <div className="index-structured-readonly">
          <code>{value || '—'}</code>
          {onEditInSource ? (
            <button type="button" className="index-link-action" onClick={onEditInSource}>
              <ExternalLink aria-hidden="true" />
              Edit in Source
            </button>
          ) : null}
        </div>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
        />
      )}
    </label>
  );
}

interface ListSectionProps {
  title: string;
  values: string[];
  readOnly?: boolean;
  onChange: (values: string[]) => void;
  onEditInSource?: () => void;
  onGoToLine?: (line: number) => void;
  lines: number[];
}

function ListSection({
  title,
  values,
  readOnly = false,
  onChange,
  onEditInSource,
  onGoToLine,
  lines,
}: ListSectionProps): React.JSX.Element {
  return (
    <section className="index-structured-section">
      <div className="index-structured-section-head">
        <h3>{title}</h3>
        <span>{values.length}</span>
      </div>
      {readOnly ? (
        <div className="index-structured-readonly">
          <p className="index-structured-note">
            This section uses syntax the restricted parser cannot safely edit.
          </p>
          <button type="button" className="index-link-action" onClick={onEditInSource}>
            <ExternalLink aria-hidden="true" />
            Edit in Source
          </button>
        </div>
      ) : values.length === 0 ? (
        <p className="index-structured-empty">No entries declared.</p>
      ) : (
        <ul className="index-structured-list">
          {values.map((value, index) => (
            <li key={`${title}-${index}-${value}`}>
              <input
                type="text"
                value={value}
                spellCheck={false}
                onChange={(event) => {
                  const next = [...values];
                  next[index] = event.target.value;
                  onChange(next);
                }}
              />
              {lines[index] ? (
                <button
                  type="button"
                  className="index-link-action"
                  onClick={() => onGoToLine?.(lines[index] ?? 1)}
                >
                  L{lines[index]}
                </button>
              ) : null}
              <button
                type="button"
                className="index-link-action danger"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {!readOnly ? (
        <button
          type="button"
          className="index-link-action"
          onClick={() => onChange([...values, ''])}
        >
          Add entry
        </button>
      ) : null}
    </section>
  );
}

export interface ManifestStructuredViewProps {
  parsed: ParsedManifest;
  source: string;
  unsupportedCount: number;
  onSourceChange: (source: string) => void;
  onEditInSource: () => void;
  onGoToLine: (line: number) => void;
}

export function ManifestStructuredView({
  parsed,
  source,
  unsupportedCount,
  onSourceChange,
  onEditInSource,
  onGoToLine,
}: ManifestStructuredViewProps): React.JSX.Element {
  const patch = (field: string, value: string | string[]) => {
    onSourceChange(patchStructuredField(source, parsed, field, value));
  };

  return (
    <div className="index-structured" aria-label="Structured manifest editor">
      <section className="index-structured-section">
        <h3>Resource</h3>
        <StructuredField
          label="Author"
          value={parsed.author?.value ?? ''}
          onChange={(value) => patch('author', value)}
        />
        <StructuredField
          label="Version"
          value={parsed.version?.value ?? ''}
          onChange={(value) => patch('version', value)}
        />
        <StructuredField
          label="Description"
          value={parsed.description?.value ?? ''}
          onChange={(value) => patch('description', value)}
        />
      </section>

      <section className="index-structured-section">
        <h3>Runtime</h3>
        <StructuredField
          label="fx_version"
          value={parsed.fxVersion?.value ?? ''}
          onChange={(value) => patch('fxVersion', value)}
        />
        <StructuredField
          label="game"
          value={parsed.game?.value ?? ''}
          onChange={(value) => patch('game', value)}
        />
        {unsupportedCount > 0 ? (
          <div className="index-structured-readonly">
            <p className="index-structured-note">
              {unsupportedCount} declaration
              {unsupportedCount === 1 ? '' : 's'} preserved for manual review (e.g. lua54,
              loadscreen).
            </p>
            <button type="button" className="index-link-action" onClick={onEditInSource}>
              <ExternalLink aria-hidden="true" />
              Edit in Source
            </button>
          </div>
        ) : null}
      </section>

      <ListSection
        title="Shared scripts"
        values={parsed.sharedScripts.map((entry) => entry.value)}
        lines={parsed.sharedScripts.map((entry) => entry.range.line)}
        onChange={(values) => patch('sharedScripts', values.filter(Boolean))}
        onGoToLine={onGoToLine}
      />
      <ListSection
        title="Client scripts"
        values={parsed.clientScripts.map((entry) => entry.value)}
        lines={parsed.clientScripts.map((entry) => entry.range.line)}
        onChange={(values) => patch('clientScripts', values.filter(Boolean))}
        onGoToLine={onGoToLine}
      />
      <ListSection
        title="Server scripts"
        values={parsed.serverScripts.map((entry) => entry.value)}
        lines={parsed.serverScripts.map((entry) => entry.range.line)}
        onChange={(values) => patch('serverScripts', values.filter(Boolean))}
        onGoToLine={onGoToLine}
      />
      <ListSection
        title="Declared files"
        values={[
          ...parsed.files.map((entry) => entry.value),
          ...(parsed.uiPage ? [parsed.uiPage.value] : []),
        ]}
        lines={[
          ...parsed.files.map((entry) => entry.range.line),
          ...(parsed.uiPage ? [parsed.uiPage.range.line] : []),
        ]}
        onChange={(values) => patch('files', values.filter(Boolean))}
        onGoToLine={onGoToLine}
      />
      <ListSection
        title="Dependencies"
        values={parsed.dependencies.map((entry) => entry.value)}
        lines={parsed.dependencies.map((entry) => entry.range.line)}
        onChange={(values) => patch('dependencies', values.filter(Boolean))}
        onGoToLine={onGoToLine}
      />

      {parsed.dataFiles.length > 0 ? (
        <ListSection
          title="Data files"
          values={parsed.dataFiles.map((entry) => `${entry.type.value} → ${entry.path.value}`)}
          lines={parsed.dataFiles.map((entry) => entry.path.range.line)}
          readOnly
          onChange={() => undefined}
          onEditInSource={onEditInSource}
          onGoToLine={onGoToLine}
        />
      ) : null}
    </div>
  );
}
