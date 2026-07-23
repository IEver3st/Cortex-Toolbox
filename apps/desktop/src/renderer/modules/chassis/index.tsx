import {
  DEFAULT_HANDLING_SETUP,
  generateVehicleMetaBundle,
  HANDLING_FIELDS,
  HANDLING_PRESETS,
  validateMetaXml,
  type HandlingPresetId,
  type HandlingSetup,
  type HandlingValues,
  type MetaFileInput,
} from '@cortex/vehicle-meta';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { recordActivity } from '../../lib/activity-history';
import { useWorkbenchDraftStore } from '../../store/workbench';
import { useWorkspaceStore } from '../../store/workspace';
import { downloadText, readSelectedFiles } from '../shared/download';
import {
  buildBundleConfig,
  buildRelationshipLinks,
  computeFieldChanges,
  presetPreviewChanges,
  summarizeFileChanges,
  workbenchCategoryForField,
} from './chassis-utils';
import { ChassisHeader, SectionNav } from './components/ChassisHeader';
import { SectionPageHost } from '../../components/SectionPageHost';
import { PresetPreviewDialog } from './components/PresetPreviewDialog';
import { ReviewSaveDialog } from './components/ReviewSaveDialog';
import { AppearanceSection } from './sections/AppearanceSection';
import { HandlingSection } from './sections/HandlingSection';
import { OverviewSection } from './sections/OverviewSection';
import { RelationshipsSection } from './sections/RelationshipsSection';
import { SourceSection } from './sections/SourceSection';
import { VehicleSetupSection } from './sections/VehicleSetupSection';
import type {
  ChassisSection,
  HandlingWorkbenchCategory,
  PresetId,
  VehicleConfig,
  VehicleIdentity,
} from './types';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

function createInitialConfig(): VehicleConfig {
  return {
    modelName: 'cortex_car',
    handlingId: 'CORTEX_CAR',
    displayName: 'CORTEX_CAR',
    makeName: 'CORTEX',
    audioNameHash: 'ADDER',
    layout: 'LAYOUT_STANDARD',
    vehicleClass: 'VC_SPORT',
    handling: { ...HANDLING_PRESETS.street.values },
    handlingSetup: {
      ...DEFAULT_HANDLING_SETUP,
      centreOfMass: { ...DEFAULT_HANDLING_SETUP.centreOfMass },
      inertiaMultiplier: { ...DEFAULT_HANDLING_SETUP.inertiaMultiplier },
      seatOffset: { ...DEFAULT_HANDLING_SETUP.seatOffset },
    },
    sirenId: 254,
    lightId: 255,
    modkitId: 1_000,
    emergency: false,
    includePulse: true,
  };
}

export default function Chassis(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const pulseDraft = useWorkbenchDraftStore((state) => state.pulse);
  const workspaceName =
    workspace?.project?.name ?? workspace?.root.split(/[\\/]/).at(-1) ?? 'Workspace';

  const [section, setSection] = useState<ChassisSection>('handling');
  const [category, setCategory] = useState<HandlingWorkbenchCategory>('powertrain');
  const [config, setConfig] = useState<VehicleConfig>(createInitialConfig);
  const [savedConfig, setSavedConfig] = useState<VehicleConfig>(createInitialConfig);
  const [presetId, setPresetId] = useState<PresetId>('street');
  const [presetBase, setPresetBase] = useState<HandlingPresetId>('street');
  const [pendingPreset, setPendingPreset] = useState<HandlingPresetId | null>(null);
  const initialFiles = useMemo(
    () => generateVehicleMetaBundle({ modelName: 'cortex_car', handlingId: 'CORTEX_CAR' }),
    [],
  );
  const [files, setFiles] = useState<MetaFileInput[]>(initialFiles);
  const [savedFiles, setSavedFiles] = useState<MetaFileInput[]>(initialFiles);
  const [activeFile, setActiveFile] = useState(
    initialFiles[1]?.name ?? initialFiles[0]?.name ?? '',
  );
  const [sourceEdited, setSourceEdited] = useState(false);
  const [search, setSearch] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [planning, setPlanning] = useState(false);

  const proposedFiles = useMemo(() => {
    const pulsePattern = pulseDraft
      ? {
          name: pulseDraft.name,
          bpm: pulseDraft.bpm,
          colors: pulseDraft.colors,
          channels: pulseDraft.channels,
          ...(pulseDraft.sirenId !== undefined ? { sirenId: pulseDraft.sirenId } : {}),
        }
      : undefined;
    return buildBundleConfig(config, pulsePattern);
  }, [config, pulseDraft]);

  const displayFiles = sourceEdited ? files : proposedFiles;
  const problems = useMemo(() => displayFiles.flatMap(validateMetaXml), [displayFiles]);
  const validationErrors = problems.filter((issue) => issue.severity === 'error').length;
  const validationWarnings = problems.filter((issue) => issue.severity === 'warning').length;

  const fieldChanges = useMemo(
    () => computeFieldChanges(savedConfig, config),
    [savedConfig, config],
  );
  const categoryChanges = useMemo(
    () =>
      fieldChanges.filter(
        (change) =>
          change.section === 'handling' &&
          change.category === category &&
          change.technicalName in config.handling,
      ),
    [fieldChanges, category, config.handling],
  );

  const relationships = useMemo(
    () => buildRelationshipLinks(config, displayFiles),
    [config, displayFiles],
  );
  const relationshipIssues = relationships.filter(
    (link) => link.status === 'conflict' || link.status === 'missing',
  ).length;

  const presetPreview = pendingPreset
    ? presetPreviewChanges(config.handling, HANDLING_PRESETS[pendingPreset].values)
    : [];
  const untouchedPresetCount = HANDLING_FIELDS.length - presetPreview.length;

  const fileSummaries = useMemo(
    () => summarizeFileChanges(savedFiles, proposedFiles),
    [savedFiles, proposedFiles],
  );

  const setField = (key: keyof HandlingValues, rawValue: number) => {
    const field = HANDLING_FIELDS.find((candidate) => candidate.key === key);
    if (!field || !Number.isFinite(rawValue)) return;
    setPresetId('custom');
    setConfig((current) => ({
      ...current,
      handling: {
        ...current.handling,
        [key]: Math.min(field.max, Math.max(field.min, rawValue)),
      },
    }));
  };

  const resetField = (key: keyof HandlingValues) => {
    setConfig((current) => ({
      ...current,
      handling: { ...current.handling, [key]: savedConfig.handling[key] },
    }));
  };

  const resetCategory = () => {
    const keys = HANDLING_FIELDS.filter(
      (field) => workbenchCategoryForField(field.key) === category,
    ).map((field) => field.key);
    setConfig((current) => {
      const nextHandling = { ...current.handling };
      for (const key of keys) nextHandling[key] = savedConfig.handling[key];
      return { ...current, handling: nextHandling };
    });
    toast.success(`${category} reset to saved values.`);
  };

  const applyPreset = (id: HandlingPresetId) => {
    setPendingPreset(id);
  };

  const confirmPreset = () => {
    if (!pendingPreset) return;
    setPresetId(pendingPreset);
    setPresetBase(pendingPreset);
    setConfig((current) => ({
      ...current,
      handling: { ...HANDLING_PRESETS[pendingPreset].values },
      vehicleClass: pendingPreset === 'emergency' ? 'VC_EMERGENCY' : current.vehicleClass,
      emergency: pendingPreset === 'emergency' ? true : current.emergency,
      audioNameHash: pendingPreset === 'emergency' ? 'POLICE' : current.audioNameHash,
    }));
    setPendingPreset(null);
    toast.success(`${HANDLING_PRESETS[pendingPreset].label} applied.`);
  };

  const updateIdentity = (key: keyof VehicleIdentity, value: string) => {
    setConfig((current) => {
      const next = { ...current, [key]: value };
      if (key === 'modelName') {
        next.handlingId = value.toUpperCase();
        next.displayName = value.toUpperCase();
      }
      return next;
    });
  };

  const updateSetup = (patch: Partial<HandlingSetup>) => {
    setConfig((current) => ({
      ...current,
      handlingSetup: { ...current.handlingSetup, ...patch },
    }));
  };

  const updateSetupVector = (
    section: 'centreOfMass' | 'inertiaMultiplier' | 'seatOffset',
    axis: 'x' | 'y' | 'z',
    value: number,
  ) => {
    if (!Number.isFinite(value)) return;
    setConfig((current) => ({
      ...current,
      handlingSetup: {
        ...current.handlingSetup,
        [section]: { ...current.handlingSetup[section], [axis]: value },
      },
    }));
  };

  const openReview = () => {
    setPlanning(true);
    setReviewOpen(true);
    setPlanning(false);
  };

  const commitSave = () => {
    setApplying(true);
    try {
      const nextFiles = proposedFiles;
      setFiles(nextFiles);
      setSavedFiles(nextFiles);
      setSavedConfig(structuredClone(config));
      setSourceEdited(false);
      setActiveFile('data/handling.meta');
      recordActivity({
        tool: 'chassis',
        workspaceRoot: workspace?.root ?? '',
        workspaceName: workspace?.project?.name ?? config.displayName,
        status: validationErrors > 0 ? 'warning' : 'success',
        summary: `${config.displayName} · ${fieldChanges.length} linked metadata changes saved`,
        navigate: { kind: 'chassis', tabLabel: 'Chassis' },
      });
      toast.success('Linked metadata saved.');
      setReviewOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save metadata.');
    } finally {
      setApplying(false);
    }
  };

  const discardChanges = () => {
    setConfig(structuredClone(savedConfig));
    setFiles(structuredClone(savedFiles));
    setPresetId('street');
    setPresetBase('street');
    setSourceEdited(false);
    toast.success('Changes discarded.');
  };

  const regenerateMissing = () => {
    const confirmed = window.confirm(
      'Generate missing metadata from the current vehicle configuration?\n\nThis rebuilds handling.meta, vehicles.meta, carvariations.meta, carcols.meta, modkits.meta, and vehiclelayouts.meta from structured values. Existing source edits in those files will be replaced.',
    );
    if (!confirmed) return;
    try {
      const next = proposedFiles;
      setFiles(next);
      setSourceEdited(false);
      setActiveFile('data/handling.meta');
      toast.success('Missing metadata generated from the current configuration.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate metadata.');
    }
  };

  const importFiles = async (list: FileList) => {
    const next = await readSelectedFiles(list);
    setFiles(next);
    setActiveFile(next[0]?.name ?? '');
    setSourceEdited(true);
    toast.success(`${next.length} file${next.length === 1 ? '' : 's'} imported.`);
  };

  const exportAll = () => {
    for (const file of displayFiles) {
      downloadText(file.name.split('/').at(-1) ?? 'vehicle.meta', file.content, 'application/xml');
    }
  };

  const navigateToField = (fieldKey: string) => {
    const field = HANDLING_FIELDS.find((candidate) => candidate.key === fieldKey);
    if (!field) return;
    setSection('handling');
    setCategory(workbenchCategoryForField(field.key));
    setHighlightedField(field.key);
    requestAnimationFrame(() => {
      document
        .getElementById(`param-${field.key}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <div className="workbench-page module-page chassis-view chassis-v2">
      <ChassisHeader
        workspaceName={workspaceName}
        vehicleName={config.modelName}
        linkedFileCount={displayFiles.length}
        unsavedCount={fieldChanges.length}
        blockingErrors={validationErrors}
        sourceEdited={sourceEdited}
        planning={planning}
        onCompare={() => setCompareOpen(true)}
        onReviewSave={openReview}
        onDiscard={discardChanges}
        onRegenerateMissing={regenerateMissing}
        onImport={(list) => void importFiles(list)}
        onExportAll={exportAll}
      />

      <SectionNav
        section={section}
        handlingWarnings={fieldChanges.filter((change) => change.section === 'handling').length}
        onChange={setSection}
      />

      <div className="chassis-body">
        <SectionPageHost pageKey={section} className="chassis-section-host" variant="settings">
          {section === 'overview' ? (
            <OverviewSection
              config={config}
              presetId={presetId}
              presetBase={presetBase}
              linkedFileCount={displayFiles.length}
              unsavedCount={fieldChanges.length}
              changes={fieldChanges}
              relationships={relationships}
              validationErrors={validationErrors}
              onNavigate={setSection}
            />
          ) : null}

          {section === 'handling' ? (
            <HandlingSection
              handling={config.handling}
              savedHandling={savedConfig.handling}
              presetId={presetId}
              presetBase={presetBase}
              category={category}
              search={search}
              changedOnly={changedOnly}
              showAdvanced={showAdvanced}
              highlightedField={highlightedField}
              categoryChanges={categoryChanges}
              allChanges={fieldChanges}
              inspectorOpen={inspectorOpen}
              onCategoryChange={setCategory}
              onSearchChange={setSearch}
              onChangedOnlyChange={setChangedOnly}
              onShowAdvancedChange={setShowAdvanced}
              onFieldChange={setField}
              onFieldReset={resetField}
              onCategoryReset={resetCategory}
              onSelectPreset={applyPreset}
              onSelectChange={navigateToField}
              onResetField={(key) => {
                const field = HANDLING_FIELDS.find((candidate) => candidate.key === key);
                if (field) resetField(field.key);
              }}
              onToggleInspector={() => setInspectorOpen((open) => !open)}
            />
          ) : null}

          {section === 'vehicle-setup' ? (
            <VehicleSetupSection
              identity={config}
              handling={config.handling}
              savedHandling={savedConfig.handling}
              handlingSetup={config.handlingSetup}
              onIdentityChange={updateIdentity}
              onHandlingChange={setField}
              onHandlingReset={resetField}
              onSetupChange={updateSetup}
              onSetupVectorChange={updateSetupVector}
            />
          ) : null}

          {section === 'appearance' ? (
            <AppearanceSection
              appearance={config}
              pulseDraftName={pulseDraft?.name ?? null}
              onChange={(patch) => setConfig((current) => ({ ...current, ...patch }))}
            />
          ) : null}

          {section === 'relationships' ? (
            <RelationshipsSection links={relationships} issueCount={relationshipIssues} />
          ) : null}

          {section === 'source' ? (
            <SourceSection
              files={displayFiles}
              activeFile={activeFile}
              compareMode={compareMode}
              savedFiles={savedFiles}
              onActiveFileChange={setActiveFile}
              onFileContentChange={(name, content) => {
                setSourceEdited(true);
                setFiles((items) =>
                  items.map((item) => (item.name === name ? { ...item, content } : item)),
                );
              }}
              onImport={(list) => void importFiles(list)}
              onToggleCompare={() => setCompareMode((mode) => !mode)}
            />
          ) : null}
        </SectionPageHost>
      </div>

      <PresetPreviewDialog
        open={pendingPreset !== null}
        presetId={pendingPreset ?? 'street'}
        changes={presetPreview}
        untouchedCount={untouchedPresetCount}
        onClose={() => setPendingPreset(null)}
        onApply={confirmPreset}
      />

      <ReviewSaveDialog
        open={reviewOpen}
        applying={applying}
        changes={fieldChanges}
        fileSummaries={fileSummaries}
        blockingErrors={validationErrors}
        warnings={validationWarnings}
        onClose={() => setReviewOpen(false)}
        onApply={commitSave}
      />

      <Dialog.Root open={compareOpen} onOpenChange={setCompareOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content chassis-review-dialog">
            <div className="dialog-title">
              <div>
                <Dialog.Title>Compare changes</Dialog.Title>
                <Dialog.Description>
                  Structured values compared against the last saved vehicle configuration.
                </Dialog.Description>
              </div>
              <Dialog.Close type="button" aria-label="Close">
                <X />
              </Dialog.Close>
            </div>
            {fieldChanges.length === 0 ? (
              <p>No structured changes since the last save.</p>
            ) : (
              <ul className="chassis-review-change-list">
                {fieldChanges.map((change) => (
                  <li key={change.id}>
                    <span>{change.label}</span>
                    <code>
                      {change.before} → {change.after}
                    </code>
                  </li>
                ))}
              </ul>
            )}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button type="button">Close</button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
