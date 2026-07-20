import { Search } from 'lucide-react';
import { type HandlingPresetId, type HandlingValues } from '@cortex/vehicle-meta';
import {
  fieldsForWorkbenchCategory,
  HANDLING_CATEGORY_LABELS,
  presetLabel as formatPresetLabel,
} from '../chassis-utils';
import { Toggle } from '../../../components/UiPrimitives';
import { BehaviorInspector } from '../components/BehaviorInspector';
import { ParameterField } from '../components/ParameterField';
import { PresetControls } from '../components/PresetControls';
import type { FieldChange, HandlingWorkbenchCategory, PresetId } from '../types';

const CATEGORY_ORDER: HandlingWorkbenchCategory[] = [
  'powertrain',
  'grip',
  'steering',
  'brakes',
  'suspension',
  'aero',
  'damage',
  'advanced',
];

export function HandlingSection({
  handling,
  savedHandling,
  presetId,
  presetBase,
  category,
  search,
  changedOnly,
  showAdvanced,
  highlightedField,
  categoryChanges,
  allChanges,
  inspectorOpen,
  onCategoryChange,
  onSearchChange,
  onChangedOnlyChange,
  onShowAdvancedChange,
  onFieldChange,
  onFieldReset,
  onCategoryReset,
  onSelectPreset,
  onSelectChange,
  onResetField,
  onToggleInspector,
}: {
  handling: HandlingValues;
  savedHandling: HandlingValues;
  presetId: PresetId;
  presetBase: HandlingPresetId;
  category: HandlingWorkbenchCategory;
  search: string;
  changedOnly: boolean;
  showAdvanced: boolean;
  highlightedField: string | null;
  categoryChanges: FieldChange[];
  allChanges: FieldChange[];
  inspectorOpen: boolean;
  onCategoryChange: (category: HandlingWorkbenchCategory) => void;
  onSearchChange: (value: string) => void;
  onChangedOnlyChange: (value: boolean) => void;
  onShowAdvancedChange: (value: boolean) => void;
  onFieldChange: (key: keyof HandlingValues, value: number) => void;
  onFieldReset: (key: keyof HandlingValues) => void;
  onCategoryReset: () => void;
  onSelectPreset: (id: HandlingPresetId) => void;
  onSelectChange: (fieldKey: string) => void;
  onResetField: (fieldKey: string) => void;
  onToggleInspector: () => void;
}): React.JSX.Element {
  const fields = fieldsForWorkbenchCategory(category, showAdvanced).filter((field) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      field.label.toLowerCase().includes(query) ||
      field.key.toLowerCase().includes(query) ||
      field.description.toLowerCase().includes(query)
    );
  });

  const visibleFields = changedOnly
    ? fields.filter((field) => handling[field.key] !== savedHandling[field.key])
    : fields;

  const warningCount = allChanges.filter((change) => change.section === 'handling').length;

  return (
    <div className={`chassis-handling-workbench${inspectorOpen ? ' inspector-open' : ''}`}>
      <aside className="chassis-handling-rail" aria-label="Handling categories">
        <label className="chassis-rail-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            placeholder="Search parameters"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <div className="chassis-rail-filter">
          <span>Changed only</span>
          <Toggle
            id="chassis-changed-only"
            checked={changedOnly}
            onChange={onChangedOnlyChange}
            ariaLabel="Changed only"
          />
        </div>
        <div className="chassis-rail-filter">
          <span>Advanced values</span>
          <Toggle
            id="chassis-advanced-values"
            checked={showAdvanced}
            onChange={onShowAdvancedChange}
            ariaLabel="Advanced values"
          />
        </div>
        <nav aria-label="Handling categories">
          {CATEGORY_ORDER.filter((item) => item !== 'advanced' || showAdvanced).map((item) => {
            const count = countCategoryChanges(item, handling, savedHandling, showAdvanced);
            return (
              <button
                key={item}
                type="button"
                className={category === item ? 'is-active' : ''}
                aria-current={category === item ? 'true' : undefined}
                onClick={() => onCategoryChange(item)}
              >
                {HANDLING_CATEGORY_LABELS[item]}
                {count > 0 ? <span className="chassis-rail-count">{count}</span> : null}
              </button>
            );
          })}
        </nav>
        {warningCount > 0 ? (
          <p className="chassis-rail-warnings" role="status">
            {warningCount} unsaved handling change{warningCount === 1 ? '' : 's'}
          </p>
        ) : null}
      </aside>

      <section className="chassis-handling-editor" aria-label="Parameter editor">
        <PresetControls
          activePreset={presetId}
          presetBase={presetBase}
          onSelectPreset={onSelectPreset}
        />
        <header className="chassis-editor-heading">
          <div>
            <h2>{HANDLING_CATEGORY_LABELS[category]}</h2>
            <p>
              {visibleFields.length} parameter{visibleFields.length === 1 ? '' : 's'}
              {changedOnly ? ' with unsaved changes' : ''}
            </p>
          </div>
          <button type="button" className="chassis-text-action" onClick={onCategoryReset}>
            Reset category
          </button>
        </header>
        <div className="chassis-param-list">
          {visibleFields.length === 0 ? (
            <p className="chassis-inspector-empty">No parameters match the current filters.</p>
          ) : (
            visibleFields.map((field) => (
              <ParameterField
                key={field.key}
                field={field}
                value={handling[field.key]}
                original={savedHandling[field.key]}
                highlighted={highlightedField === field.key}
                onChange={(value) => onFieldChange(field.key, value)}
                onReset={() => onFieldReset(field.key)}
              />
            ))
          )}
        </div>
        <button
          type="button"
          className="chassis-inspector-toggle"
          aria-expanded={inspectorOpen}
          onClick={onToggleInspector}
        >
          {inspectorOpen ? 'Hide behavior profile' : 'Show behavior profile'}
        </button>
      </section>

      <BehaviorInspector
        handling={handling}
        savedHandling={savedHandling}
        presetLabel={formatPresetLabel(presetId, presetBase)}
        changes={categoryChanges}
        onSelectChange={onSelectChange}
        onResetField={onResetField}
        onResetCategory={onCategoryReset}
        categoryLabel={HANDLING_CATEGORY_LABELS[category]}
      />
    </div>
  );
}

function countCategoryChanges(
  category: HandlingWorkbenchCategory,
  handling: HandlingValues,
  saved: HandlingValues,
  showAdvanced: boolean,
): number {
  return fieldsForWorkbenchCategory(category, showAdvanced).filter(
    (field) => handling[field.key] !== saved[field.key],
  ).length;
}
