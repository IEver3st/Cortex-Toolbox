export function VectorInputs({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: { x: number; y: number; z: number };
  min: number;
  max: number;
  step?: number;
  onChange: (axis: 'x' | 'y' | 'z', value: number) => void;
}): React.JSX.Element {
  return (
    <fieldset className="chassis-vector-inputs">
      <legend>{label}</legend>
      {(['x', 'y', 'z'] as const).map((axis) => (
        <label key={axis}>
          <span>{axis.toUpperCase()}</span>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value[axis]}
            onChange={(event) => onChange(axis, Number(event.target.value))}
          />
        </label>
      ))}
    </fieldset>
  );
}
