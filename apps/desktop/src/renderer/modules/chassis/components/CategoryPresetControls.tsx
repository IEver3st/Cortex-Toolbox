import { Tooltip } from '../../../components/Tooltip';
import { CATEGORY_PRESETS, categoryPresetMatches, type CategoryPreset } from '../category-presets';
import { HANDLING_CATEGORY_LABELS } from '../chassis-utils';
import type { HandlingSetup, HandlingValues } from '@cortex/vehicle-meta';
import type { HandlingWorkbenchCategory } from '../types';

export function CategoryPresetControls({
  category,
  handling,
  setup,
  onApply,
}: {
  category: HandlingWorkbenchCategory;
  handling: HandlingValues;
  setup: HandlingSetup;
  onApply: (preset: CategoryPreset) => void;
}): React.JSX.Element {
  const presets = CATEGORY_PRESETS[category];
  const categoryLabel = HANDLING_CATEGORY_LABELS[category];

  return (
    <div className="chassis-category-presets">
      <span className="chassis-category-preset-label">{categoryLabel} presets</span>
      <div role="group" aria-label={`${categoryLabel} presets`}>
        {presets.map((preset) => {
          const active = categoryPresetMatches(handling, setup, preset);
          return (
            <Tooltip
              key={preset.id}
              content={preset.description}
              side="bottom"
              delayMs={260}
              className="chassis-preset-tooltip"
            >
              <button
                type="button"
                className={active ? 'is-active' : ''}
                aria-pressed={active}
                onClick={() => onApply(preset)}
              >
                {preset.label}
              </button>
            </Tooltip>
          );
        })}
      </div>
      <span className="chassis-category-preset-scope">Only this section</span>
    </div>
  );
}
