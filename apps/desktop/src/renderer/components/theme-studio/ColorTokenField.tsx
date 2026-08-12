import { RotateCcw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { normalizeHexColor } from '../../../shared/theme-schema';
import { contrastRatio, formatContrast, rateContrast } from '../../lib/theme/contrast';
import { finalizeColorDraft } from './color-draft';

const TOKEN_LABELS: Record<string, string> = {
  signal: 'Signal',
  canvas: 'Canvas',
  surface: 'Surface',
  rail: 'Rail',
  ink: 'Ink',
  mutedInk: 'Muted ink',
  outline: 'Outline',
  editorCanvas: 'Editor canvas',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  informational: 'Informational',
  diffAddition: 'Diff addition',
  diffRemoval: 'Diff removal',
  syntaxSelection: 'Syntax selection',
};

export function ColorTokenField({
  tokenKey,
  value,
  contrastAgainst,
  onChange,
  onReset,
  canReset,
}: {
  tokenKey: string;
  value: string;
  contrastAgainst?: string | undefined;
  onChange: (value: string) => void;
  onReset: () => void;
  canReset: boolean;
}): React.JSX.Element {
  const inputId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const [draftValue, setDraftValue] = useState(value);
  const label = TOKEN_LABELS[tokenKey] ?? tokenKey;
  const contrast =
    contrastAgainst && (tokenKey === 'ink' || tokenKey === 'mutedInk')
      ? formatContrast(rateContrast(contrastRatio(value, contrastAgainst)))
      : null;
  const invalid = normalizeHexColor(draftValue) === null;

  useEffect(() => setDraftValue(value), [value]);

  const commitDraft = () => {
    const finalized = finalizeColorDraft(draftValue, value);
    setDraftValue(finalized.value);
    if (finalized.shouldCommit) onChange(finalized.value);
  };

  return (
    <div className="theme-token-field">
      <div className="theme-token-field-head">
        <label htmlFor={inputId}>{label}</label>
        {contrast ? (
          <span
            className={`theme-token-contrast${contrast.includes('Fail') || contrast.includes('Advisory') ? ' is-warn' : ' is-pass'}`}
            aria-live="polite"
          >
            {contrast.includes('Fail') ? '✕ ' : contrast.includes('Advisory') ? '△ ' : '✓ '}
            {contrast}
          </span>
        ) : null}
      </div>
      <div className="theme-token-field-controls">
        <button
          type="button"
          className="theme-token-swatch"
          aria-label={`Pick ${label} color`}
          style={{ backgroundColor: value }}
          onClick={() => pickerRef.current?.click()}
        />
        <input
          ref={textRef}
          id={inputId}
          type="text"
          className={invalid ? 'is-invalid' : ''}
          value={draftValue}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid}
          onChange={(event) => setDraftValue(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraft();
              textRef.current?.blur();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setDraftValue(value);
              textRef.current?.blur();
            }
          }}
        />
        <input
          ref={pickerRef}
          type="color"
          className="theme-token-picker"
          value={normalizeHexColor(value) ?? '#000000'}
          aria-label={`${label} color picker`}
          onChange={(event) => {
            setDraftValue(event.target.value);
            onChange(event.target.value);
          }}
        />
        <button
          type="button"
          className="theme-token-reset"
          aria-label={`Reset ${label}`}
          disabled={!canReset}
          onClick={onReset}
        >
          <RotateCcw aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
