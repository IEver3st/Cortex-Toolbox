export function BalanceControl({
  value,
  min,
  max,
  step,
  rearLabel,
  frontLabel,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  rearLabel: string;
  frontLabel: string;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <div className="chassis-balance-control">
      <span className="chassis-balance-label">{rearLabel}</span>
      <input
        type="range"
        className="chassis-param-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${rearLabel} to ${frontLabel}`}
        aria-valuetext={`${Math.round(value * 100)}% front`}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      <span className="chassis-balance-label">{frontLabel}</span>
      <output className="chassis-balance-output">{value.toFixed(2)}</output>
    </div>
  );
}
