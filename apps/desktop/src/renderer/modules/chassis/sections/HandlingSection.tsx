import {
  type HandlingPresetId,
  type HandlingSetup,
  type HandlingValues,
} from '@cortex/vehicle-meta';
import { BookOpen, Search } from 'lucide-react';
import { useState } from 'react';
import { Select } from '../../../components/Select';
import { Toggle } from '../../../components/UiPrimitives';
import {
  fieldsForWorkbenchCategory,
  HANDLING_CATEGORY_LABELS,
  presetLabel as formatPresetLabel,
} from '../chassis-utils';
import { BehaviorInspector } from '../components/BehaviorInspector';
import { CategoryPresetControls } from '../components/CategoryPresetControls';
import { ParameterField } from '../components/ParameterField';
import { ParameterWikiDialog } from '../components/ParameterWikiDialog';
import { PresetControls } from '../components/PresetControls';
import { VectorInputs } from '../components/VectorInputs';
import type { CategoryPreset } from '../category-presets';
import type { FieldChange, HandlingWorkbenchCategory, PresetId } from '../types';

const CATEGORY_ORDER: HandlingWorkbenchCategory[] = [
  'physical',
  'powertrain',
  'braking',
  'traction',
  'suspension',
  'damage',
  'advanced',
];

const SUB_HANDLING_TYPES: Record<HandlingSetup['subHandling'], string> = {
  none: 'NULL',
  car: 'CCarHandlingData',
  bike: 'CBikeHandlingData',
  boat: 'CBoatHandlingData',
  trailer: 'CTrailerHandlingData',
  other: '',
};

function subHandlingLabel(value: string | undefined): string {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) return 'Other imported type';
  return trimmed;
}

function countCategoryChanges(
  category: HandlingWorkbenchCategory,
  handling: HandlingValues,
  saved: HandlingValues,
): number {
  return fieldsForWorkbenchCategory(category, true).filter(
    (field) => handling[field.key] !== saved[field.key],
  ).length;
}

export function HandlingSection({
  handling,
  savedHandling,
  handlingSetup,
  savedHandlingSetup,
  presetId,
  presetBase,
  category,
  search,
  changedOnly,
  highlightedField,
  aiModifiedFields,
  categoryChanges,
  allChanges,
  inspectorOpen,
  onCategoryChange,
  onSearchChange,
  onChangedOnlyChange,
  onFieldChange,
  onFieldReset,
  onCategoryReset,
  onApplyCategoryPreset,
  onSelectPreset,
  onSelectChange,
  onResetField,
  onToggleInspector,
  onSetupChange,
  onSetupVectorChange,
}: {
  handling: HandlingValues;
  savedHandling: HandlingValues;
  handlingSetup: HandlingSetup;
  savedHandlingSetup: HandlingSetup;
  presetId: PresetId;
  presetBase: HandlingPresetId;
  category: HandlingWorkbenchCategory;
  search: string;
  changedOnly: boolean;
  showAdvanced: boolean;
  highlightedField: string | null;
  aiModifiedFields: ReadonlySet<string>;
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
  onApplyCategoryPreset: (preset: CategoryPreset) => void;
  onSelectPreset: (id: HandlingPresetId) => void;
  onSelectChange: (fieldKey: string) => void;
  onResetField: (fieldKey: string) => void;
  onToggleInspector: () => void;
  onSetupChange: (patch: Partial<HandlingSetup>) => void;
  onSetupVectorChange: (
    vector: 'centreOfMass' | 'inertiaMultiplier' | 'seatOffset',
    axis: 'x' | 'y' | 'z',
    value: number,
  ) => void;
}): React.JSX.Element {
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiArticleId, setWikiArticleId] = useState<string | null>(null);
  const query = search.trim().toLowerCase();
  const fields = fieldsForWorkbenchCategory(category, true).filter(
    (field) =>
      !query ||
      field.label.toLowerCase().includes(query) ||
      field.key.toLowerCase().includes(query) ||
      field.description.toLowerCase().includes(query),
  );
  const visibleFields = changedOnly
    ? fields.filter((field) => handling[field.key] !== savedHandling[field.key])
    : fields;
  const warningCount = allChanges.filter(
    (change) => change.section === 'handling' || change.section === 'vehicle-setup',
  ).length;
  const openWiki = (articleId: string | null) => {
    setWikiArticleId(articleId);
    setWikiOpen(true);
  };

  return (
    <div
      className={`chassis-handling-workbench chassis-fast-editor${inspectorOpen ? ' inspector-open' : ''}`}
    >
      <div className="chassis-handling-toolbar">
        <label className="chassis-rail-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            placeholder="Search handling fields"
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
            ariaLabel="Show changed fields only"
          />
        </div>
        {warningCount > 0 ? (
          <span className="chassis-inline-change-count" role="status">
            {warningCount} changed
          </span>
        ) : null}
      </div>

      <nav className="chassis-category-tabs" aria-label="Handling categories">
        {CATEGORY_ORDER.map((item) => {
          const count = countCategoryChanges(item, handling, savedHandling);
          return (
            <button
              key={item}
              type="button"
              className={category === item ? 'is-active' : ''}
              aria-current={category === item ? 'page' : undefined}
              onClick={() => onCategoryChange(item)}
            >
              {HANDLING_CATEGORY_LABELS[item]}
              {count > 0 ? <span>{count}</span> : null}
            </button>
          );
        })}
      </nav>

      <section className="chassis-handling-editor" aria-label="Handling parameter editor">
        <header className="chassis-editor-heading">
          <div>
            <h2>{HANDLING_CATEGORY_LABELS[category]}</h2>
            <p>
              {visibleFields.length} numeric parameter{visibleFields.length === 1 ? '' : 's'}
              {changedOnly ? ' changed from the saved file' : ''}
            </p>
          </div>
          <div className="chassis-editor-heading-actions">
            <button
              type="button"
              className="chassis-text-action chassis-wiki-open-all"
              onClick={() => openWiki(visibleFields[0]?.key ?? 'centreOfMass')}
            >
              <BookOpen aria-hidden="true" />
              Search wiki
            </button>
            <button type="button" className="chassis-text-action" onClick={onCategoryReset}>
              Reset section
            </button>
            <button
              type="button"
              className="chassis-text-action"
              aria-expanded={inspectorOpen}
              onClick={onToggleInspector}
            >
              {inspectorOpen ? 'Hide analysis' : 'Show analysis'}
            </button>
          </div>
        </header>

        <CategoryPresetControls
          category={category}
          handling={handling}
          setup={handlingSetup}
          onApply={onApplyCategoryPreset}
        />

        {category === 'physical' ? (
          <div className="chassis-vector-stack">
            <VectorInputs
              label="Centre of mass"
              value={handlingSetup.centreOfMass}
              original={savedHandlingSetup.centreOfMass}
              min={-2}
              max={2}
              directions={{
                x: ['Left', 'Right'],
                y: ['Rear', 'Front'],
                z: ['Lower', 'Higher'],
              }}
              aiModifiedAxes={
                new Set(
                  (['x', 'y', 'z'] as const).filter((axis) =>
                    aiModifiedFields.has(`centreOfMass.${axis}`),
                  ),
                )
              }
              onChange={(axis, value) => onSetupVectorChange('centreOfMass', axis, value)}
              onOpenWiki={() => openWiki('centreOfMass')}
              onReset={(axis) =>
                onSetupVectorChange('centreOfMass', axis, savedHandlingSetup.centreOfMass[axis])
              }
            />
            <VectorInputs
              label="Inertia multiplier"
              value={handlingSetup.inertiaMultiplier}
              original={savedHandlingSetup.inertiaMultiplier}
              min={0.1}
              max={5}
              directions={{
                x: ['Less pitch', 'More pitch'],
                y: ['Less roll', 'More roll'],
                z: ['Less yaw', 'More yaw'],
              }}
              aiModifiedAxes={
                new Set(
                  (['x', 'y', 'z'] as const).filter((axis) =>
                    aiModifiedFields.has(`inertiaMultiplier.${axis}`),
                  ),
                )
              }
              onChange={(axis, value) => onSetupVectorChange('inertiaMultiplier', axis, value)}
              onOpenWiki={() => openWiki('inertiaMultiplier')}
              onReset={(axis) =>
                onSetupVectorChange(
                  'inertiaMultiplier',
                  axis,
                  savedHandlingSetup.inertiaMultiplier[axis],
                )
              }
            />
          </div>
        ) : null}

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
                aiModified={aiModifiedFields.has(field.key)}
                onChange={(value) => onFieldChange(field.key, value)}
                onReset={() => onFieldReset(field.key)}
                onOpenWiki={() => openWiki(field.key)}
              />
            ))
          )}
        </div>

        {category === 'advanced' ? (
          <div className="chassis-advanced-settings">
            <VectorInputs
              label="Seat offset"
              value={handlingSetup.seatOffset}
              original={savedHandlingSetup.seatOffset}
              min={-2}
              max={2}
              directions={{
                x: ['Left', 'Right'],
                y: ['Rear', 'Front'],
                z: ['Lower', 'Higher'],
              }}
              aiModifiedAxes={
                new Set(
                  (['x', 'y', 'z'] as const).filter((axis) =>
                    aiModifiedFields.has(`seatOffset.${axis}`),
                  ),
                )
              }
              onChange={(axis, value) => onSetupVectorChange('seatOffset', axis, value)}
              onOpenWiki={() => openWiki('seatOffset')}
              onReset={(axis) =>
                onSetupVectorChange('seatOffset', axis, savedHandlingSetup.seatOffset[axis])
              }
            />
            <div className="chassis-advanced-grid">
              <label>
                <span>Monetary value</span>
                <input
                  type="number"
                  step={1}
                  value={handlingSetup.monetaryValue}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(value)) onSetupChange({ monetaryValue: value });
                  }}
                />
              </label>
              <label>
                <span>AI handling</span>
                <input
                  value={handlingSetup.aiHandling}
                  onChange={(event) => onSetupChange({ aiHandling: event.target.value })}
                />
              </label>
              <label>
                <span>Model flags</span>
                <input
                  value={handlingSetup.modelFlags}
                  onChange={(event) => onSetupChange({ modelFlags: event.target.value })}
                />
              </label>
              <label>
                <span>Handling flags</span>
                <input
                  value={handlingSetup.handlingFlags}
                  onChange={(event) => onSetupChange({ handlingFlags: event.target.value })}
                />
              </label>
              <label>
                <span>Damage flags</span>
                <input
                  value={handlingSetup.damageFlags}
                  onChange={(event) => onSetupChange({ damageFlags: event.target.value })}
                />
              </label>
              <label>
                <span>Subhandling</span>
                <Select
                  id="chassis-subhandling"
                  value={handlingSetup.subHandling}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'car', label: 'Car' },
                    { value: 'bike', label: 'Bike' },
                    { value: 'boat', label: 'Boat' },
                    { value: 'trailer', label: 'Trailer' },
                    ...(handlingSetup.subHandling === 'other'
                      ? [
                          {
                            value: 'other' as const,
                            label: subHandlingLabel(handlingSetup.subHandlingType),
                          },
                        ]
                      : []),
                  ]}
                  onChange={(subHandling) => {
                    const subHandlingType =
                      subHandling === 'other'
                        ? handlingSetup.subHandlingType
                        : SUB_HANDLING_TYPES[subHandling];
                    onSetupChange({
                      subHandling,
                      ...(subHandlingType ? { subHandlingType } : {}),
                    });
                  }}
                />
              </label>
            </div>
          </div>
        ) : null}

        <details className="chassis-preset-tools">
          <summary>Apply a handling preset</summary>
          <PresetControls
            activePreset={presetId}
            presetBase={presetBase}
            onSelectPreset={onSelectPreset}
          />
        </details>
      </section>

      <BehaviorInspector
        handling={handling}
        savedHandling={savedHandling}
        presetLabel={formatPresetLabel(presetId, presetBase)}
        changes={categoryChanges}
        onSelectChange={onSelectChange}
        onResetField={onResetField}
        onResetCategory={onCategoryReset}
      />
      <ParameterWikiDialog
        open={wikiOpen}
        initialArticleId={wikiArticleId}
        onOpenChange={setWikiOpen}
      />
    </div>
  );
}
