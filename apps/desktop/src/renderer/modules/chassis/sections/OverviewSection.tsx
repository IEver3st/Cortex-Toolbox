import { AlertTriangle, ArrowRight, FileText, Link2 } from 'lucide-react';
import type { FieldChange, RelationshipLink, VehicleConfig } from '../types';
import { presetLabel as formatPresetLabel } from '../chassis-utils';
import type { PresetId } from '../types';
import type { HandlingPresetId } from '@cortex/vehicle-meta';
import { HANDLING_PRESETS } from '@cortex/vehicle-meta';

export function OverviewSection({
  config,
  presetId,
  presetBase,
  linkedFileCount,
  unsavedCount,
  changes,
  relationships,
  validationErrors,
  onNavigate,
}: {
  config: VehicleConfig;
  presetId: PresetId;
  presetBase: HandlingPresetId;
  linkedFileCount: number;
  unsavedCount: number;
  changes: FieldChange[];
  relationships: RelationshipLink[];
  validationErrors: number;
  onNavigate: (section: 'handling' | 'relationships' | 'source' | 'appearance') => void;
}): React.JSX.Element {
  const conflictCount = relationships.filter((link) => link.status === 'conflict').length;
  const missingCount = relationships.filter((link) => link.status === 'missing').length;
  const recommended =
    validationErrors > 0
      ? 'Resolve blocking validation issues in Relationships.'
      : unsavedCount > 0
        ? 'Review unsaved changes before saving linked metadata.'
        : missingCount > 0
          ? 'Complete missing references in Relationships.'
          : 'Tune handling or review source files.';

  return (
    <div className="chassis-overview">
      <header className="chassis-overview-hero">
        <div>
          <h2>{config.displayName}</h2>
          <p className="chassis-overview-identifiers">
            <code>{config.modelName}</code>
            <span aria-hidden="true">·</span>
            <code>{config.handlingId}</code>
          </p>
        </div>
        <div className="chassis-overview-profile">
          <span>Handling profile</span>
          <strong>{formatPresetLabel(presetId, presetBase)}</strong>
          <small>{HANDLING_PRESETS[presetBase].description}</small>
        </div>
      </header>

      <div className="chassis-overview-grid">
        <OverviewCard title="Linked metadata" icon={FileText}>
          <p>
            <strong>{linkedFileCount}</strong> files linked to this vehicle
          </p>
          <button
            type="button"
            className="chassis-text-action"
            onClick={() => onNavigate('source')}
          >
            Open source <ArrowRight aria-hidden="true" />
          </button>
        </OverviewCard>

        <OverviewCard title="Relationship health" icon={Link2}>
          <p>
            {conflictCount > 0 ? (
              <span className="is-danger">{conflictCount} conflicts</span>
            ) : (
              <span className="is-clear">No conflicts</span>
            )}
            {missingCount > 0 ? ` · ${missingCount} missing` : ''}
          </p>
          <button
            type="button"
            className="chassis-text-action"
            onClick={() => onNavigate('relationships')}
          >
            Validate links <ArrowRight aria-hidden="true" />
          </button>
        </OverviewCard>

        <OverviewCard title="Unsaved changes" icon={AlertTriangle}>
          <p>
            <strong>{unsavedCount}</strong> field{unsavedCount === 1 ? '' : 's'} changed since last
            save
          </p>
          {unsavedCount > 0 ? (
            <button
              type="button"
              className="chassis-text-action"
              onClick={() => onNavigate('handling')}
            >
              Review tuning <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
        </OverviewCard>
      </div>

      {changes.length > 0 ? (
        <section className="chassis-overview-recent">
          <h3>Recent edits</h3>
          <ul>
            {changes.slice(0, 6).map((change) => (
              <li key={change.id}>
                <span>{change.label}</span>
                <code>
                  {change.before} → {change.after}
                </code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="chassis-overview-next">
        <strong>Recommended next action</strong>
        <p>{recommended}</p>
      </footer>
    </div>
  );
}

function OverviewCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof FileText;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="chassis-overview-card">
      <header>
        <Icon aria-hidden="true" />
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  );
}
