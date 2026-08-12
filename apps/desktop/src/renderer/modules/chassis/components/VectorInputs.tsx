import { RotateCcw } from 'lucide-react';

type Axis = 'x' | 'y' | 'z';
type Vector = Record<Axis, number>;

export function VectorInputs({
  label,
  value,
  original,
  min,
  max,
  step = 0.01,
  directions,
  aiModifiedAxes,
  onChange,
  onReset,
}: {
  label: string;
  value: Vector;
  original?: Vector;
  min: number;
  max: number;
  step?: number;
  directions?: Record<Axis, [string, string]>;
  aiModifiedAxes?: ReadonlySet<Axis>;
  onChange: (axis: Axis, value: number) => void;
  onReset?: (axis: Axis) => void;
}): React.JSX.Element {
  return (
    <fieldset className="chassis-vector-inputs chassis-vector-sliders">
      <legend>{label}</legend>
      {(['x', 'y', 'z'] as const).map((axis) => {
        const changed = original ? value[axis] !== original[axis] : false;
        const sliderMin = Math.min(min, value[axis], original?.[axis] ?? value[axis]);
        const sliderMax = Math.max(max, value[axis], original?.[axis] ?? value[axis]);
        const labels = directions?.[axis] ?? ['Lower', 'Higher'];
        return (
          <div className={`chassis-vector-axis${changed ? ' is-changed' : ''}`} key={axis}>
            <span className="chassis-vector-axis-name">
              {axis.toUpperCase()}
              {aiModifiedAxes?.has(axis) ? <i>AI</i> : null}
            </span>
            <div className="chassis-vector-track">
              <input
                type="range"
                aria-label={`${label} ${axis.toUpperCase()}`}
                min={sliderMin}
                max={sliderMax}
                step={step}
                value={value[axis]}
                onChange={(event) => onChange(axis, Number(event.currentTarget.value))}
              />
              <div className="chassis-vector-directions" aria-hidden="true">
                <span>{labels[0]}</span>
                <span>{labels[1]}</span>
              </div>
            </div>
            <input
              type="number"
              className="chassis-vector-number"
              aria-label={`${label} ${axis.toUpperCase()} precise value`}
              step={step}
              value={value[axis]}
              onChange={(event) => {
                const next = event.currentTarget.valueAsNumber;
                if (Number.isFinite(next)) onChange(axis, next);
              }}
            />
            {onReset ? (
              <button
                type="button"
                className="icon-button chassis-vector-reset"
                aria-label={`Reset ${label} ${axis.toUpperCase()} to loaded value`}
                disabled={!changed}
                onClick={() => onReset(axis)}
              >
                <RotateCcw aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}
