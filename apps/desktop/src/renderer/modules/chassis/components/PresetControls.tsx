import { HANDLING_PRESETS, type HandlingPresetId } from '@cortex/vehicle-meta';
import type { PresetId } from '../types';

export function PresetControls({
  activePreset,
  presetBase,
  onSelectPreset,
}: {
  activePreset: PresetId;
  presetBase: HandlingPresetId;
  onSelectPreset: (id: HandlingPresetId) => void;
}): React.JSX.Element {
  const entries = Object.entries(HANDLING_PRESETS) as [
    HandlingPresetId,
    (typeof HANDLING_PRESETS)[HandlingPresetId],
  ][];

  return (
    <div className="chassis-preset-bar" role="list" aria-label="Handling intent presets">
      {entries.map(([id, option]) => (
        <button
          key={id}
          type="button"
          role="listitem"
          className={
            activePreset === id || (activePreset === 'custom' && presetBase === id)
              ? 'is-active'
              : ''
          }
          aria-pressed={activePreset === id}
          title={option.description}
          onClick={() => onSelectPreset(id)}
        >
          {option.label}
        </button>
      ))}
      {activePreset === 'custom' ? (
        <span className="chassis-preset-custom" role="status">
          Custom · based on {HANDLING_PRESETS[presetBase].label}
        </span>
      ) : null}
    </div>
  );
}
