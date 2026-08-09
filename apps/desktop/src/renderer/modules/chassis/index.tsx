import {
  DEFAULT_HANDLING_SETUP,
  HANDLING_FIELDS,
  HANDLING_PRESETS,
  buildHandlingXml,
  parseHandlingDocument,
  updateHandlingEntry,
  validateHandlingEntry,
  validateMetaXml,
  type HandlingDocument,
  type HandlingDocumentEntry,
  type HandlingPresetId,
  type HandlingSetup,
  type HandlingValues,
  type MetaFileInput,
} from '@cortex/vehicle-meta';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AiChangeProposal } from '@cortex/ai';
import { CodeEditor } from '../../components/CodeEditor';
import { SectionPageHost } from '../../components/SectionPageHost';
import { recordActivity } from '../../lib/activity-history';
import { unwrap } from '../../lib/result';
import { useWorkbenchDraftStore } from '../../store/workbench';
import { useWorkspaceStore } from '../../store/workspace';
import { usePreferences } from '../../hooks/usePreferences';
import { registerCortexAiModuleProvider } from '../../ai/module-registry';
import { downloadText } from '../shared/download';
import {
  buildBundleConfig,
  buildRelationshipLinks,
  computeFieldChanges,
  applyAiHandlingPatch,
  presetPreviewChanges,
  workbenchCategoryForField,
} from './chassis-utils';
import { ChassisHeader, SectionNav } from './components/ChassisHeader';
import { CreateHandlingDialog, type CreateHandlingInput } from './components/CreateHandlingDialog';
import { PresetPreviewDialog } from './components/PresetPreviewDialog';
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

function cloneSetup(setup: HandlingSetup): HandlingSetup {
  return {
    ...setup,
    centreOfMass: { ...setup.centreOfMass },
    inertiaMultiplier: { ...setup.inertiaMultiplier },
    seatOffset: { ...setup.seatOffset },
  };
}

function createEmptyConfig(): VehicleConfig {
  return {
    modelName: '',
    handlingId: '',
    displayName: '',
    makeName: '',
    audioNameHash: 'ADDER',
    layout: 'LAYOUT_STANDARD',
    vehicleClass: 'VC_SPORT',
    handling: { ...HANDLING_PRESETS.street.values },
    handlingSetup: cloneSetup(DEFAULT_HANDLING_SETUP),
    sirenId: 254,
    lightId: 255,
    modkitId: 1_000,
    emergency: false,
    includePulse: true,
  };
}

function configFromEntry(entry: HandlingDocumentEntry): VehicleConfig {
  return {
    ...createEmptyConfig(),
    modelName: entry.handlingName,
    handlingId: entry.handlingName,
    displayName: entry.handlingName,
    handling: { ...entry.values },
    handlingSetup: cloneSetup(entry.setup),
  };
}

function isHandlingPath(relativePath: string): boolean {
  return relativePath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase() === 'handling.meta';
}

function sameConfig(left: VehicleConfig, right: VehicleConfig): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function Chassis(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const workspaceFiles = useWorkspaceStore((state) => state.files);
  const aiEnabled = usePreferences().data?.aiEnabled === true;
  const setWorkspaceFiles = useWorkspaceStore((state) => state.setFiles);
  const pulseDraft = useWorkbenchDraftStore((state) => state.pulse);
  const [section, setSection] = useState<ChassisSection>('handling');
  const [category, setCategory] = useState<HandlingWorkbenchCategory>('physical');
  const [config, setConfig] = useState<VehicleConfig>(createEmptyConfig);
  const [savedConfig, setSavedConfig] = useState<VehicleConfig>(createEmptyConfig);
  const [document, setDocument] = useState<HandlingDocument | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editedSource, setEditedSource] = useState('');
  const [sourceEdited, setSourceEdited] = useState(false);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [externalSource, setExternalSource] = useState<string | null>(null);
  const [externalCompareOpen, setExternalCompareOpen] = useState(false);
  const ignoredExternalSource = useRef<string | null>(null);
  const autoLoadedKey = useRef<string | null>(null);
  const [presetId, setPresetId] = useState<PresetId>('custom');
  const [presetBase, setPresetBase] = useState<HandlingPresetId>('street');
  const [pendingPreset, setPendingPreset] = useState<HandlingPresetId | null>(null);
  const [search, setSearch] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [aiModifiedFields, setAiModifiedFields] = useState<Set<string>>(() => new Set());

  const workspaceName =
    workspace?.project?.name ?? workspace?.root.split(/[\\/]/).at(-1) ?? 'Workspace';
  const handlingPaths = useMemo(
    () => workspaceFiles.map((file) => file.relativePath).filter(isHandlingPath),
    [workspaceFiles],
  );
  const defaultCreatePath = useMemo(() => {
    const relatedMeta = workspaceFiles.find((file) => {
      const name = file.relativePath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
      return name === 'vehicles.meta' || name === 'carvariations.meta';
    });
    const normalized = relatedMeta?.relativePath.replaceAll('\\', '/');
    const directory = normalized?.includes('/')
      ? normalized.slice(0, normalized.lastIndexOf('/'))
      : '';
    return directory ? `${directory}/handling.meta` : 'handling.meta';
  }, [workspaceFiles]);
  const selectedEntry = useMemo(
    () => document?.entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [document, selectedEntryId],
  );

  const applyLoadedDocument = useCallback(
    (relativePath: string, nextDocument: HandlingDocument, entryIndex = 0) => {
      const entry = nextDocument.entries[entryIndex] ?? nextDocument.entries[0];
      if (!entry) throw new Error('No CHandlingData entries were found in this file.');
      const nextConfig = configFromEntry(entry);
      setDocument(nextDocument);
      setActivePath(relativePath);
      setSelectedEntryId(entry.id);
      setConfig(nextConfig);
      setSavedConfig(structuredClone(nextConfig));
      setEditedSource(nextDocument.source);
      setSourceEdited(false);
      setPresetId('custom');
      setPresetBase('street');
      setLoadState('ready');
      setLoadError(null);
      setSavedAt(null);
      setExternalSource(null);
      setAiModifiedFields(new Set());
      ignoredExternalSource.current = null;
      setSection('handling');
    },
    [],
  );

  const loadHandlingPath = useCallback(
    async (relativePath: string, entryIndex = 0) => {
      setLoadState('loading');
      setLoadError(null);
      try {
        const read = unwrap(await window.cortex.files.read({ relativePath }));
        applyLoadedDocument(relativePath, parseHandlingDocument(read.content), entryIndex);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not open handling.meta.';
        setLoadState('error');
        setLoadError(message);
        toast.error(message);
      }
    },
    [applyLoadedDocument],
  );

  useEffect(() => {
    if (!workspace) {
      setDocument(null);
      setActivePath(null);
      setSelectedEntryId(null);
      setLoadState('idle');
      autoLoadedKey.current = null;
      return;
    }
    const nextPath =
      activePath && handlingPaths.includes(activePath) ? activePath : handlingPaths[0];
    if (!nextPath) {
      if (workspaceFiles.length > 0) setLoadState('idle');
      return;
    }
    const key = `${workspace.root}\n${nextPath}`;
    if (autoLoadedKey.current === key && document) return;
    autoLoadedKey.current = key;
    void loadHandlingPath(nextPath);
  }, [activePath, document, handlingPaths, loadHandlingPath, workspace, workspaceFiles.length]);

  const pulsePattern = useMemo(
    () =>
      pulseDraft
        ? {
            name: pulseDraft.name,
            bpm: pulseDraft.bpm,
            colors: pulseDraft.colors,
            channels: pulseDraft.channels,
            ...(pulseDraft.sirenId !== undefined ? { sirenId: pulseDraft.sirenId } : {}),
          }
        : undefined,
    [pulseDraft],
  );
  const structuredSource = useMemo(() => {
    if (!document || !selectedEntryId) return '';
    try {
      return updateHandlingEntry(document, selectedEntryId, {
        handlingName: config.handlingId,
        values: config.handling,
        setup: config.handlingSetup,
      });
    } catch {
      return document.source;
    }
  }, [config.handling, config.handlingId, config.handlingSetup, document, selectedEntryId]);
  const currentSource = sourceEdited ? editedSource : structuredSource;
  const displayFiles = useMemo<MetaFileInput[]>(
    () => (activePath && document ? [{ name: activePath, content: currentSource }] : []),
    [activePath, currentSource, document],
  );
  const savedFiles = useMemo<MetaFileInput[]>(
    () => (activePath && document ? [{ name: activePath, content: document.source }] : []),
    [activePath, document],
  );
  const problems = useMemo(() => displayFiles.flatMap(validateMetaXml), [displayFiles]);
  const validationErrors = problems.filter((issue) => issue.severity === 'error').length;
  const validationWarnings = problems.filter((issue) => issue.severity === 'warning').length;
  const deterministicIssues = useMemo(
    () =>
      document && selectedEntryId
        ? validateHandlingEntry(document, selectedEntryId, {
            handlingName: config.handlingId,
            values: config.handling,
            setup: config.handlingSetup,
          })
        : [],
    [config.handling, config.handlingId, config.handlingSetup, document, selectedEntryId],
  );
  const fieldChanges = useMemo(
    () => (document ? computeFieldChanges(savedConfig, config) : []),
    [config, document, savedConfig],
  );
  const dirty = sourceEdited || !sameConfig(config, savedConfig);
  const categoryChanges = useMemo(
    () =>
      fieldChanges.filter(
        (change) =>
          change.section === 'handling' &&
          change.category === category &&
          change.technicalName in config.handling,
      ),
    [category, config.handling, fieldChanges],
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

  const setField = (key: keyof HandlingValues, value: number) => {
    if (!Number.isFinite(value)) return;
    setPresetId('custom');
    setAiModifiedFields((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setConfig((current) => ({
      ...current,
      handling: { ...current.handling, [key]: value },
    }));
  };

  const resetField = (key: keyof HandlingValues) => {
    setAiModifiedFields((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
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
      const handling = { ...current.handling };
      for (const key of keys) handling[key] = savedConfig.handling[key];
      return { ...current, handling };
    });
    setAiModifiedFields((current) => {
      const next = new Set(current);
      for (const key of keys) next.delete(key);
      return next;
    });
    toast.success('Section restored to saved values.');
  };

  const updateSetup = (patch: Partial<HandlingSetup>) => {
    setConfig((current) => ({
      ...current,
      handlingSetup: { ...current.handlingSetup, ...patch },
    }));
  };

  const updateSetupVector = (
    vector: 'centreOfMass' | 'inertiaMultiplier' | 'seatOffset',
    axis: 'x' | 'y' | 'z',
    value: number,
  ) => {
    if (!Number.isFinite(value)) return;
    setAiModifiedFields((current) => {
      const next = new Set(current);
      next.delete(`${vector}.${axis}`);
      return next;
    });
    setConfig((current) => ({
      ...current,
      handlingSetup: {
        ...current.handlingSetup,
        [vector]: { ...current.handlingSetup[vector], [axis]: value },
      },
    }));
  };

  const selectEntry = (entryId: string) => {
    if (dirty && !window.confirm('Discard unsaved handling changes and switch entries?')) return;
    const entry = document?.entries.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    const nextConfig = configFromEntry(entry);
    setSelectedEntryId(entry.id);
    setConfig(nextConfig);
    setSavedConfig(structuredClone(nextConfig));
    setEditedSource(document?.source ?? '');
    setSourceEdited(false);
    setPresetId('custom');
    setSavedAt(null);
  };

  const selectFile = (relativePath: string) => {
    if (relativePath === activePath) return;
    if (dirty && !window.confirm('Discard unsaved handling changes and open another file?')) return;
    autoLoadedKey.current = workspace ? `${workspace.root}\n${relativePath}` : relativePath;
    void loadHandlingPath(relativePath);
  };

  const pickHandling = async () => {
    try {
      const picked = unwrap(await window.cortex.files.pickHandling());
      if (!picked) return;
      applyLoadedDocument(picked.relativePath, parseHandlingDocument(picked.content));
      const listed = unwrap(await window.cortex.files.list());
      setWorkspaceFiles(listed);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open handling.meta.');
    }
  };

  const createHandling = async ({ handlingName, relativePath }: CreateHandlingInput) => {
    if (creating) return;
    setCreating(true);
    try {
      const source = buildHandlingXml(
        handlingName,
        HANDLING_PRESETS.street.values,
        DEFAULT_HANDLING_SETUP,
      );
      const parsed = parseHandlingDocument(source);
      const plan = unwrap(await window.cortex.files.planCreateHandling({ relativePath, source }));
      unwrap(await window.cortex.files.applyWrite({ planId: plan.id }));
      const listed = unwrap(await window.cortex.files.list());
      setWorkspaceFiles(listed);
      autoLoadedKey.current = workspace ? `${workspace.root}\n${relativePath}` : relativePath;
      applyLoadedDocument(relativePath, parsed);
      setSavedAt(new Date());
      setCreateDialogOpen(false);
      recordActivity({
        tool: 'chassis',
        workspaceRoot: workspace?.root ?? '',
        workspaceName,
        status: 'success',
        summary: `${relativePath} · ${handlingName} created`,
        navigate: { kind: 'chassis', tabLabel: 'Chassis' },
      });
      toast.success(`${relativePath} created`);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Could not create handling.meta.', {
        cause: error,
      });
    } finally {
      setCreating(false);
    }
  };

  const saveHandling = useCallback(async () => {
    if (!document || !activePath || !selectedEntryId || saving || !dirty) return;
    if (validationErrors > 0 || deterministicIssues.length > 0) {
      const first =
        deterministicIssues[0]?.message ?? problems[0]?.message ?? 'Fix validation errors first.';
      toast.error(first);
      return;
    }
    setSaving(true);
    try {
      const source = sourceEdited
        ? editedSource
        : updateHandlingEntry(document, selectedEntryId, {
            handlingName: config.handlingId,
            values: config.handling,
            setup: config.handlingSetup,
          });
      const parsed = parseHandlingDocument(source);
      const currentIndex = selectedEntry?.index ?? 0;
      const plan = unwrap(
        await window.cortex.files.planWrite({ relativePath: activePath, source }),
      );
      unwrap(await window.cortex.files.applyWrite({ planId: plan.id }));
      applyLoadedDocument(activePath, parsed, currentIndex);
      setSavedAt(new Date());
      const listed = unwrap(await window.cortex.files.list());
      setWorkspaceFiles(listed);
      recordActivity({
        tool: 'chassis',
        workspaceRoot: workspace?.root ?? '',
        workspaceName,
        status: validationWarnings > 0 ? 'warning' : 'success',
        summary: `${activePath} · ${parsed.entries[currentIndex]?.handlingName ?? 'handling'} saved`,
        navigate: { kind: 'chassis', tabLabel: 'Chassis' },
      });
      toast.success(`${activePath.split('/').at(-1) ?? 'handling.meta'} saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save handling.meta.');
    } finally {
      setSaving(false);
    }
  }, [
    activePath,
    applyLoadedDocument,
    config.handling,
    config.handlingId,
    config.handlingSetup,
    deterministicIssues,
    dirty,
    document,
    editedSource,
    problems,
    saving,
    selectedEntry,
    selectedEntryId,
    setWorkspaceFiles,
    sourceEdited,
    validationErrors,
    validationWarnings,
    workspace,
    workspaceName,
  ]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && dirty) {
        event.preventDefault();
        void saveHandling();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [dirty, saveHandling]);

  useEffect(() => {
    if (!activePath || !document) return;
    const check = () => {
      void window.cortex.files.read({ relativePath: activePath }).then((result) => {
        if (!result.ok) return;
        if (
          result.data.content !== document.source &&
          result.data.content !== ignoredExternalSource.current
        ) {
          setExternalSource(result.data.content);
        }
      });
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [activePath, document]);

  const discardChanges = () => {
    setConfig(structuredClone(savedConfig));
    setEditedSource(document?.source ?? '');
    setSourceEdited(false);
    setPresetId('custom');
    setAiModifiedFields(new Set());
    toast.success('Changes restored to the last saved file.');
  };

  const confirmPreset = () => {
    if (!pendingPreset) return;
    setPresetId(pendingPreset);
    setPresetBase(pendingPreset);
    setConfig((current) => ({
      ...current,
      handling: { ...HANDLING_PRESETS[pendingPreset].values },
    }));
    setPendingPreset(null);
    toast.success(`${HANDLING_PRESETS[pendingPreset].label} applied to the loaded entry.`);
  };

  const exportGeneratedMetadata = () => {
    if (!config.modelName.trim() || !config.handlingId.trim()) {
      toast.error('Open a handling entry before generating a complete metadata bundle.');
      return;
    }
    const confirmed = window.confirm(
      'Create a complete generated vehicle metadata bundle from the current structured values? This downloads new files and does not replace the open handling.meta.',
    );
    if (!confirmed) return;
    const generatedBundle = buildBundleConfig(config, pulsePattern);
    for (const file of generatedBundle) {
      downloadText(file.name.split('/').at(-1) ?? 'vehicle.meta', file.content, 'application/xml');
    }
    toast.success('Generated vehicle metadata downloaded. The open handling.meta was not changed.');
  };

  const updateIdentity = (key: keyof VehicleIdentity, value: string) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const navigateToField = (fieldKey: string) => {
    const field = HANDLING_FIELDS.find((candidate) => candidate.key === fieldKey);
    if (!field) return;
    setSection('handling');
    setCategory(workbenchCategoryForField(field.key));
    setHighlightedField(field.key);
    requestAnimationFrame(() => {
      globalThis.document
        .getElementById(`param-${field.key}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  useEffect(() => {
    if (!aiEnabled || !activePath || !selectedEntry) return;
    return registerCortexAiModuleProvider({
      moduleId: 'chassis',
      getContext: () => [
        {
          id: 'active-handling',
          label: `${activePath} · ${selectedEntry.handlingName}`,
          content: JSON.stringify({
            relativePath: activePath,
            handlingName: selectedEntry.handlingName,
            values: config.handling,
            setup: config.handlingSetup,
            unsavedChanges: fieldChanges,
          }),
          priority: 'automatic',
        },
      ],
      getAttachments: () => [
        {
          id: `handling:${activePath}:${selectedEntry.handlingName}`,
          kind: 'handling',
          label: selectedEntry.handlingName,
          reference: `${activePath}#${selectedEntry.handlingName}`,
        },
      ],
      getSuggestedActions: () => [
        {
          id: 'diagnose',
          label: 'Diagnose handling',
          prompt: 'Diagnose the active handling entry.',
        },
        {
          id: 'stability',
          label: 'Improve stability',
          prompt: 'Improve stability while preserving vehicle character.',
        },
      ],
      applyProposal: (proposal: AiChangeProposal) => {
        const applied = applyAiHandlingPatch({
          proposal,
          activePath,
          handlingName: selectedEntry.handlingName,
          handling: config.handling,
          setup: config.handlingSetup,
        });
        if (!applied) return false;
        setConfig((current) => ({
          ...current,
          handling: applied.handling,
          handlingSetup: applied.setup,
        }));
        setAiModifiedFields((current) => new Set([...current, ...applied.attributed]));
        const firstScalar = [...applied.attributed].find((key) => key in applied.handling);
        if (firstScalar) {
          setCategory(workbenchCategoryForField(firstScalar as keyof HandlingValues));
          setHighlightedField(firstScalar);
        }
        setSection('handling');
        setSourceEdited(false);
        setPresetId('custom');
        return true;
      },
    });
  }, [activePath, aiEnabled, config.handling, config.handlingSetup, fieldChanges, selectedEntry]);

  if (!workspace) {
    return (
      <div className="workbench-page module-page chassis-view chassis-v2">
        <div className="chassis-empty-state">
          <h2>Open a workspace first</h2>
          <p>Chassis edits handling.meta files inside the active Toolbox workspace.</p>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="workbench-page module-page chassis-view chassis-v2">
        <div className="chassis-empty-state" aria-live="polite">
          {loadState === 'loading' ? (
            <>
              <h2>Opening handling.meta…</h2>
              <p>Reading the workspace file and its handling entries.</p>
            </>
          ) : (
            <>
              <h2>{loadError ? 'Could not open handling.meta' : 'No handling.meta found'}</h2>
              <p>
                {loadError ??
                  'Open a handling file in this workspace or create metadata explicitly.'}
              </p>
              <div className="header-actions">
                <button type="button" className="primary" onClick={() => void pickHandling()}>
                  Open file
                </button>
                <button type="button" onClick={() => setCreateDialogOpen(true)}>
                  Create handling
                </button>
              </div>
              <CreateHandlingDialog
                open={createDialogOpen}
                busy={creating}
                defaultPath={defaultCreatePath}
                onOpenChange={setCreateDialogOpen}
                onCreate={createHandling}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="workbench-page module-page chassis-view chassis-v2">
      <ChassisHeader
        workspaceName={workspaceName}
        activePath={activePath ?? 'handling.meta'}
        handlingPaths={handlingPaths}
        entries={document.entries}
        selectedEntryId={selectedEntryId ?? ''}
        dirty={dirty}
        saving={saving}
        blockingErrors={validationErrors + deterministicIssues.length}
        savedAt={savedAt}
        onFileChange={selectFile}
        onEntryChange={selectEntry}
        onCompare={() => setCompareMode((value) => !value)}
        onSave={() => void saveHandling()}
        onDiscard={discardChanges}
        onGenerateMetadata={exportGeneratedMetadata}
        onOpenFile={() => void pickHandling()}
        aiEnabled={aiEnabled}
        onAskAi={(prompt) => {
          window.dispatchEvent(new CustomEvent('cortex-ai:ask', { detail: { prompt } }));
        }}
      />

      {externalSource ? (
        <div className="chassis-external-change" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>handling.meta changed on disk</strong>
            <span>
              Reload it before saving, or compare the external version with your baseline.
            </span>
          </div>
          <button
            type="button"
            className="primary"
            onClick={() => {
              try {
                applyLoadedDocument(
                  activePath ?? 'handling.meta',
                  parseHandlingDocument(externalSource),
                  selectedEntry?.index ?? 0,
                );
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not reload the file.');
              }
            }}
          >
            Reload
          </button>
          <button type="button" onClick={() => setExternalCompareOpen(true)}>
            Compare
          </button>
          <button
            type="button"
            onClick={() => {
              ignoredExternalSource.current = externalSource;
              setExternalSource(null);
            }}
          >
            Keep editing
          </button>
        </div>
      ) : null}

      <SectionNav section={section} onChange={setSection} editingExisting />

      <div className="chassis-body">
        <SectionPageHost pageKey={section} className="chassis-section-host" variant="settings">
          {section === 'handling' ? (
            <HandlingSection
              handling={config.handling}
              savedHandling={savedConfig.handling}
              handlingSetup={config.handlingSetup}
              savedHandlingSetup={savedConfig.handlingSetup}
              presetId={presetId}
              presetBase={presetBase}
              category={category}
              search={search}
              changedOnly={changedOnly}
              showAdvanced={showAdvanced}
              highlightedField={highlightedField}
              aiModifiedFields={aiModifiedFields}
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
              onSelectPreset={setPendingPreset}
              onSelectChange={navigateToField}
              onResetField={(key) => {
                const field = HANDLING_FIELDS.find((candidate) => candidate.key === key);
                if (field) resetField(field.key);
              }}
              onToggleInspector={() => setInspectorOpen((open) => !open)}
              onSetupChange={updateSetup}
              onSetupVectorChange={updateSetupVector}
            />
          ) : null}

          {section === 'source' ? (
            <SourceSection
              files={displayFiles}
              activeFile={activePath ?? ''}
              compareMode={compareMode}
              savedFiles={savedFiles}
              onActiveFileChange={() => undefined}
              onFileContentChange={(_name, content) => {
                setEditedSource(content);
                setSourceEdited(content !== structuredSource);
              }}
              onOpenFile={() => void pickHandling()}
              onToggleCompare={() => setCompareMode((mode) => !mode)}
            />
          ) : null}

          {section === 'overview' ? (
            <OverviewSection
              config={config}
              presetId={presetId}
              presetBase={presetBase}
              linkedFileCount={1}
              unsavedCount={fieldChanges.length}
              changes={fieldChanges}
              relationships={relationships}
              validationErrors={validationErrors}
              onNavigate={setSection}
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
        </SectionPageHost>
      </div>

      <PresetPreviewDialog
        open={pendingPreset !== null}
        presetId={pendingPreset ?? 'street'}
        changes={presetPreview}
        untouchedCount={HANDLING_FIELDS.length - presetPreview.length}
        onClose={() => setPendingPreset(null)}
        onApply={confirmPreset}
      />

      <Dialog.Root open={externalCompareOpen} onOpenChange={setExternalCompareOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content chassis-external-compare">
            <div className="dialog-title">
              <div>
                <Dialog.Title>External handling.meta changes</Dialog.Title>
                <Dialog.Description>
                  Saved Toolbox baseline on the left; current disk contents on the right.
                </Dialog.Description>
              </div>
              <Dialog.Close type="button" aria-label="Close">
                <X aria-hidden="true" />
              </Dialog.Close>
            </div>
            <div className="chassis-source-diff">
              <CodeEditor value={document.source} label="Toolbox baseline" readOnly />
              <CodeEditor value={externalSource ?? ''} label="Current disk file" readOnly />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
