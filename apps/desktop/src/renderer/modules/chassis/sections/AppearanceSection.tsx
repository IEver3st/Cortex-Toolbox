import { Check, Link2 } from 'lucide-react';
import { Toggle } from '../../../components/UiPrimitives';
import type { AppearanceConfig } from '../types';

export function AppearanceSection({
  appearance,
  pulseDraftName,
  onChange,
}: {
  appearance: AppearanceConfig;
  pulseDraftName: string | null;
  onChange: (patch: Partial<AppearanceConfig>) => void;
}): React.JSX.Element {
  return (
    <div className="chassis-appearance-page">
      <header className="chassis-page-intro">
        <h2>Appearance</h2>
        <p>Colors, liveries, mod kits, variation settings, and emergency light bindings.</p>
      </header>

      <section className="chassis-setup-panel">
        <div className="settings-row chassis-toggle-row">
          <div className="settings-row-copy">
            <span className="settings-row-label">Emergency vehicle</span>
            <span className="settings-row-description">
              Enable siren and light bindings in carvariations and carcols.
            </span>
          </div>
          <div className="settings-row-control">
            <Toggle
              id="chassis-emergency"
              name="chassisEmergency"
              checked={appearance.emergency}
              onChange={(checked) => onChange({ emergency: checked })}
            />
          </div>
        </div>

        <div className="chassis-form-grid">
          <label>
            Mod kit ID
            <input
              type="number"
              min={1}
              max={1023}
              value={appearance.modkitId}
              onChange={(event) => onChange({ modkitId: Number(event.target.value) })}
            />
            <small>Written to modkits.meta and carvariations.meta</small>
          </label>
          <label>
            Light settings ID
            <input
              type="number"
              min={1}
              max={255}
              value={appearance.lightId}
              onChange={(event) => onChange({ lightId: Number(event.target.value) })}
            />
          </label>
          {appearance.emergency ? (
            <label>
              Siren settings ID
              <input
                type="number"
                min={1}
                max={65534}
                value={appearance.sirenId}
                onChange={(event) => onChange({ sirenId: Number(event.target.value) })}
              />
            </label>
          ) : null}
        </div>

        <div className={pulseDraftName ? 'linked-draft' : 'linked-draft is-empty'}>
          <div className="linked-draft-copy">
            <Link2 aria-hidden="true" />
            <div className="linked-draft-text">
              <strong>{pulseDraftName ?? 'No active Pulse pattern'}</strong>
              <small>
                {pulseDraftName
                  ? 'Pulse pattern can replace the empty siren definition on save.'
                  : 'Open Pulse to design a pattern. Chassis detects it automatically.'}
              </small>
            </div>
          </div>
          {pulseDraftName && appearance.emergency ? (
            <div className="settings-row-control">
              <Toggle
                id="include-pulse"
                name="includePulse"
                checked={appearance.includePulse}
                onChange={(checked) => onChange({ includePulse: checked })}
              />
            </div>
          ) : null}
        </div>

        {pulseDraftName && appearance.emergency && appearance.includePulse ? (
          <p className="connection-confirmation">
            <Check aria-hidden="true" /> Pulse will be linked using this vehicle&apos;s siren ID
            when metadata is saved.
          </p>
        ) : null}
      </section>

      <section className="chassis-setup-panel">
        <h3>Variation settings</h3>
        <p className="chassis-page-note">
          Color tables and livery names are preserved in source when present. Use the Source section
          to edit carvariations and carcols XML directly.
        </p>
      </section>
    </div>
  );
}
