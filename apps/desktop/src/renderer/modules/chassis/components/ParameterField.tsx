import type { HandlingFieldDefinition } from '@cortex/vehicle-meta';
import { Clipboard, RotateCcw } from 'lucide-react';
import { handlingNativeCall } from '@cortex/vehicle-meta';
import { toast } from 'sonner';
import { copyText } from '../../../lib/clipboard';
import { formatFieldValue, isBalanceField } from '../chassis-utils';
import { BalanceControl } from './BalanceControl';

export function ParameterField({
  field,
  value,
  original,
  highlighted,
  aiModified,
  onChange,
  onReset,
}: {
  field: HandlingFieldDefinition;
  value: number;
  original: number;
  highlighted?: boolean;
  aiModified?: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
}): React.JSX.Element {
  const inputId = `handling-${field.key}`;
  const changed = value !== original;
  const native = handlingNativeCall(field, value);
  const balance = isBalanceField(field.key);
  const outsideTypicalRange = value < field.min || value > field.max;
  const sliderMin = Math.min(field.min, value);
  const sliderMax = Math.max(field.max, value);

  const setFinite = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    onChange(field.nativeType === 'int' ? Math.round(raw) : raw);
  };

  return (
    <article
      className={`chassis-param${changed ? ' is-changed' : ''}${highlighted ? ' is-highlighted' : ''}`}
      id={`param-${field.key}`}
      data-field={field.key}
    >
      <div className="chassis-param-head">
        <div className="chassis-param-labels">
          <label htmlFor={inputId}>{field.label}</label>
          <code className="chassis-param-technical" title="Technical property name">
            {field.key}
          </code>
          {aiModified ? <span className="chassis-param-ai">AI</span> : null}
        </div>
        <div className="chassis-param-value-row">
          <input
            id={inputId}
            type="number"
            className="chassis-param-input"
            step={field.step}
            value={value}
            aria-describedby={`${inputId}-desc`}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isFinite(next)) setFinite(next);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                const delta = event.key === 'ArrowUp' ? field.step : -field.step;
                setFinite(value + delta);
              }
            }}
          />
          {field.unit ? <span className="chassis-param-unit">{field.unit}</span> : null}
          <button
            type="button"
            className="icon-button chassis-param-copy"
            title={native}
            aria-label={`Copy native call for ${field.label}`}
            onClick={() =>
              void copyText(native)
                .then((copied) =>
                  copied ? toast.success('Native call copied.') : toast.error('Could not copy.'),
                )
                .catch(() => toast.error('Could not copy.'))
            }
          >
            <Clipboard aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button chassis-param-reset"
            aria-label={`Reset ${field.label}`}
            title="Reset to saved value"
            disabled={!changed}
            onClick={onReset}
          >
            <RotateCcw aria-hidden="true" />
          </button>
        </div>
      </div>

      {balance ? (
        <BalanceControl
          value={value}
          min={sliderMin}
          max={sliderMax}
          step={field.step}
          rearLabel="Rear"
          frontLabel="Front"
          onChange={setFinite}
        />
      ) : field.nativeType === 'int' ? (
        <div className="chassis-stepper" role="group" aria-label={field.label}>
          <button type="button" onClick={() => setFinite(value - field.step)} aria-label="Decrease">
            −
          </button>
          <span className="chassis-stepper-value">{Math.round(value)}</span>
          <button type="button" onClick={() => setFinite(value + field.step)} aria-label="Increase">
            +
          </button>
        </div>
      ) : (
        <input
          type="range"
          className="chassis-param-slider"
          aria-label={field.label}
          min={sliderMin}
          max={sliderMax}
          step={field.step}
          value={value}
          onChange={(event) => setFinite(Number(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              const delta = event.key === 'ArrowRight' ? field.step : -field.step;
              setFinite(value + delta);
            }
          }}
        />
      )}

      <div className="chassis-param-meta">
        <span>
          Original <strong>{formatFieldValue(field, original)}</strong>
        </span>
        <span>
          Typical {formatFieldValue(field, field.min)}–{formatFieldValue(field, field.max)}
        </span>
        {outsideTypicalRange ? <span className="is-warning">Outside typical range</span> : null}
        <span className="chassis-param-source">handling.meta</span>
      </div>
      <p className="chassis-param-desc" id={`${inputId}-desc`}>
        {field.description}
      </p>
    </article>
  );
}
