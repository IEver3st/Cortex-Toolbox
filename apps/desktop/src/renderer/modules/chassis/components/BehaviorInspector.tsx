import type { HandlingValues } from '@cortex/vehicle-meta';
import { Gauge } from 'lucide-react';
import type { BehaviorProfile, FieldChange } from '../types';
import { buildBehaviorProfile, formatDrive } from '../chassis-utils';

export function BehaviorInspector({
  handling,
  savedHandling,
  presetLabel,
  changes,
  onSelectChange,
  onResetField,
  onResetCategory,
  categoryLabel,
}: {
  handling: HandlingValues;
  savedHandling: HandlingValues;
  presetLabel: string;
  changes: FieldChange[];
  onSelectChange: (fieldKey: string) => void;
  onResetField: (fieldKey: string) => void;
  onResetCategory?: () => void;
  categoryLabel?: string;
}): React.JSX.Element {
  const current = buildBehaviorProfile(handling);
  const original = buildBehaviorProfile(savedHandling);
  const hasChanges = changes.length > 0;

  return (
    <aside className="chassis-inspector" aria-label="Derived behavior profile">
      <header className="chassis-inspector-head">
        <div>
          <span className="chassis-inspector-kicker">
            <Gauge aria-hidden="true" />
            Derived behavior profile
          </span>
          <h2>{presetLabel}</h2>
        </div>
      </header>
      <p className="chassis-inspector-note">
        Calculated from the current metadata values. Actual in-game behavior may vary.
      </p>

      <section className="chassis-inspector-block" aria-label="Behavior summary">
        <BehaviorRow
          label="Drive layout"
          current={current.driveLayout}
          original={original.driveLayout}
        />
        <BehaviorRow
          label="Drive split"
          current={current.driveSplit}
          original={original.driveSplit}
        />
        <BehaviorRow
          label="Acceleration"
          current={current.acceleration}
          original={original.acceleration}
        />
        <BehaviorRow
          label="Top-speed tendency"
          current={current.topSpeedTendency}
          original={original.topSpeedTendency}
        />
        <BehaviorRow
          label="Grip window"
          current={current.gripWindow}
          original={original.gripWindow}
        />
        <BehaviorRow
          label="Steering response"
          current={current.steeringResponse}
          original={original.steeringResponse}
        />
        <BehaviorRow
          label="Brake balance"
          current={current.brakeBalance}
          original={original.brakeBalance}
        />
        <BehaviorRow
          label="Suspension"
          current={current.suspensionCompliance}
          original={original.suspensionCompliance}
        />
        <BehaviorRow
          label="Damage resistance"
          current={current.damageResistance}
          original={original.damageResistance}
        />
      </section>

      <DriveBiasDiagram bias={handling.fDriveBiasFront} />
      <BrakeBalanceBar bias={handling.fBrakeBiasFront} />

      <section className="chassis-inspector-changes" aria-label="Changed values">
        <div className="chassis-inspector-changes-head">
          <h3>Changed values · {changes.length}</h3>
          {onResetCategory && changes.length > 0 ? (
            <button type="button" className="chassis-text-action" onClick={onResetCategory}>
              Reset category
            </button>
          ) : null}
        </div>
        {changes.length === 0 ? (
          <p className="chassis-inspector-empty">No changes in this category.</p>
        ) : (
          <ul className="chassis-change-list">
            {changes.map((change) => (
              <li key={change.id}>
                <button
                  type="button"
                  className="chassis-change-item"
                  onClick={() => onSelectChange(change.technicalName)}
                >
                  <span>{change.label}</span>
                  <code>
                    {change.before} → {change.after}
                  </code>
                </button>
                <button
                  type="button"
                  className="chassis-text-action"
                  aria-label={`Reset ${change.label}`}
                  onClick={() => onResetField(change.technicalName)}
                >
                  Reset
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

function BehaviorRow({
  label,
  current,
  original,
}: {
  label: string;
  current: string;
  original: string;
}): React.JSX.Element {
  const changed = current !== original;
  return (
    <div className={`chassis-behavior-row${changed ? ' is-changed' : ''}`}>
      <span>{label}</span>
      <strong>{current}</strong>
      {changed ? <small>was {original}</small> : null}
    </div>
  );
}

function DriveBiasDiagram({ bias }: { bias: number }): React.JSX.Element {
  const front = Math.round(bias * 100);
  return (
    <figure className="chassis-diagram" aria-label={`Drive bias ${formatDrive(bias)}`}>
      <figcaption>Drive bias</figcaption>
      <div className="chassis-diagram-axle">
        <div className="chassis-diagram-wheel front" style={{ opacity: 0.35 + bias * 0.65 }} />
        <div className="chassis-diagram-body" />
        <div className="chassis-diagram-wheel rear" style={{ opacity: 0.35 + (1 - bias) * 0.65 }} />
      </div>
      <span className="chassis-diagram-caption">
        {front}% front · {100 - front}% rear
      </span>
    </figure>
  );
}

function BrakeBalanceBar({ bias }: { bias: number }): React.JSX.Element {
  const front = Math.round(bias * 100);
  return (
    <figure className="chassis-diagram" aria-label={`Brake balance ${front}% front`}>
      <figcaption>Brake balance</figcaption>
      <div className="chassis-balance-bar" role="img">
        <span style={{ width: `${front}%` }} />
      </div>
      <span className="chassis-diagram-caption">{front}% front</span>
    </figure>
  );
}
