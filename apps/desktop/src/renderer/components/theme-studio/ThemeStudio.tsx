import { ChevronDown, Redo2, RotateCcw, Save, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Preferences } from '../../../shared/contracts';
import {
  ADVANCED_TOKEN_KEYS,
  FOUNDATION_TOKEN_KEYS,
  isBuiltinPaletteId,
  normalizeHexColor,
  parseThemeImport,
  type AdvancedTokenKey,
  type FoundationTokenKey,
  type StoredPalette,
  type TokenOverrides,
} from '../../../shared/theme-schema';
import { BUILTIN_PALETTE_META } from '../../lib/theme/builtins';
import { CODE_FONTS, detectAvailableFonts, INTERFACE_FONTS } from '../../lib/theme/fonts';
import {
  diffPreferences,
  exportPaletteFromPreferences,
  storedPaletteFromExport,
  type ThemeChange,
} from '../../lib/theme/palette-io';
import {
  isCustomizedPalette,
  paletteDisplayName,
  resolveActivePaletteId,
  resolveBasePaletteId,
  resolvedColorMode,
  resolveThemeTokens,
} from '../../lib/theme/resolve';
import { Select } from '../Select';
import { Toggle } from '../UiPrimitives';
import { ColorTokenField } from './ColorTokenField';
import { PaletteSelector, type PaletteOption } from './PaletteSelector';
import { ThemeStudioPreview } from './ThemeStudioPreview';

const FOUNDATION_LABELS: Record<FoundationTokenKey, string> = {
  signal: 'Primary interaction, selection, and focus color.',
  canvas: 'Main workspace background.',
  surface: 'Panels, menus, toolbars, and elevated regions.',
  rail: 'Primary navigation/sidebar background.',
  ink: 'Primary text color.',
  mutedInk: 'Secondary and metadata text.',
  outline: 'Borders, separators, and control outlines.',
  editorCanvas: 'Code and source-editor background.',
};

const INTERFACE_MODE_LABELS: Record<Preferences['colorMode'], string> = {
  system: 'Follow system',
  light: 'Light',
  dark: 'Dark',
};

function usePreferenceHistory(
  value: Preferences,
  onChange: (next: Preferences) => void,
  saved: Preferences,
) {
  const past = useRef<Preferences[]>([]);
  const future = useRef<Preferences[]>([]);
  const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });

  const push = useCallback(
    (next: Preferences) => {
      past.current = [...past.current.slice(-40), value];
      future.current = [];
      onChange(next);
      setAvailability({ canUndo: true, canRedo: false });
    },
    [onChange, value],
  );

  const undo = useCallback(() => {
    const previous = past.current.at(-1);
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [value, ...future.current];
    onChange(previous);
    setAvailability({ canUndo: past.current.length > 0, canRedo: true });
  }, [onChange, value]);

  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, value];
    onChange(next);
    setAvailability({ canUndo: true, canRedo: future.current.length > 0 });
  }, [onChange, value]);

  const restoreSaved = useCallback(() => {
    past.current = [];
    future.current = [];
    onChange(saved);
    setAvailability({ canUndo: false, canRedo: false });
  }, [onChange, saved]);

  return {
    push,
    undo,
    redo,
    restoreSaved,
    canUndo: availability.canUndo,
    canRedo: availability.canRedo,
  };
}

export function ThemeStudio({
  draft,
  saved,
  onChange,
}: {
  draft: Preferences;
  saved: Preferences;
  onChange: (next: Preferences) => void;
}): React.JSX.Element {
  const history = usePreferenceHistory(draft, onChange, saved);
  const [previewMode, setPreviewMode] = useState<'workspace' | 'editor' | 'dialog'>('workspace');
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [contrastAdvancedOpen, setContrastAdvancedOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [fontAvailability, setFontAvailability] = useState<Map<string, boolean>>(new Map());
  const importRef = useRef<HTMLInputElement>(null);
  const previewModeResolved = resolvedColorMode(draft.colorMode);
  const tokens = resolveThemeTokens(draft, previewModeResolved);
  const basePaletteId = resolveBasePaletteId(draft);
  const customized = isCustomizedPalette(draft);

  useEffect(() => {
    void detectAvailableFonts([...INTERFACE_FONTS, ...CODE_FONTS]).then(setFontAvailability);
  }, []);

  const paletteOptions = useMemo((): PaletteOption[] => {
    const builtins = BUILTIN_PALETTE_META.map((palette) => ({
      id: palette.id,
      name: palette.name,
      description: palette.description,
      source: 'builtin' as const,
      modeSupport: palette.modeSupport,
      swatches: [...palette.swatches],
      group: 'cortex' as const,
    }));
    const custom = draft.customPalettes.map((palette) => ({
      id: palette.id,
      name: palette.name,
      ...(palette.description ? { description: palette.description } : {}),
      source: palette.source,
      modeSupport: palette.modeSupport,
      swatches: [palette.dark.rail, palette.dark.canvas, palette.dark.signal, palette.dark.ink],
      group: palette.source === 'imported' ? ('imported' as const) : ('mine' as const),
    }));
    return [...builtins, ...custom];
  }, [draft.customPalettes]);

  const unsavedChanges = useMemo(() => diffPreferences(saved, draft), [draft, saved]);
  const hasUnsavedPaletteEdits =
    customized || resolveActivePaletteId(draft) !== resolveActivePaletteId(saved);

  const updateToken = (key: FoundationTokenKey | AdvancedTokenKey, raw: string) => {
    const normalized = normalizeHexColor(raw);
    if (!normalized) return;
    history.push(patchTokenOverride(draft, previewModeResolved, key, normalized));
  };

  const resetToken = (key: FoundationTokenKey | AdvancedTokenKey) => {
    history.push(clearTokenOverride(draft, previewModeResolved, key));
  };

  const selectPalette = (paletteId: string) => {
    const next: Preferences = {
      ...draft,
      selectedPaletteId: paletteId,
      themeOverrides: null,
      themePreset: isBuiltinPaletteId(paletteId) ? paletteId : draft.themePreset,
    };
    history.push(next);
  };

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const duplicatePalette = (paletteId: string) => {
    const source = paletteOptions.find((palette) => palette.id === paletteId);
    if (!source) return;
    const exported = exportPaletteFromPreferences(
      {
        ...draft,
        selectedPaletteId: paletteId,
        themeOverrides: null,
        themePreset: isBuiltinPaletteId(paletteId) ? paletteId : draft.themePreset,
      },
      `${source.name} copy`,
    );
    const stored = storedPaletteFromExport(exported, 'custom');
    history.push({
      ...draft,
      customPalettes: [...draft.customPalettes, stored],
      selectedPaletteId: stored.id,
      themeOverrides: null,
    });
    toast.success('Palette duplicated.');
  };

  const exportPalette = (paletteId: string) => {
    const payload = exportPaletteFromPreferences(
      {
        ...draft,
        selectedPaletteId: paletteId,
        themeOverrides: null,
        themePreset: isBuiltinPaletteId(paletteId) ? paletteId : draft.themePreset,
      },
      paletteOptions.find((palette) => palette.id === paletteId)?.name ?? 'Cortex palette',
    );
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${payload.name.toLowerCase().replace(/\s+/g, '-')}.cortex-theme.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const deletePalette = (paletteId: string) => {
    if (isBuiltinPaletteId(paletteId)) return;
    if (!window.confirm('Delete this palette? This cannot be undone.')) return;
    history.push({
      ...draft,
      customPalettes: draft.customPalettes.filter((palette) => palette.id !== paletteId),
      selectedPaletteId: draft.themePreset,
      themeOverrides: null,
    });
    toast.success('Palette deleted.');
  };

  const renamePalette = (paletteId: string) => {
    const palette = draft.customPalettes.find((entry) => entry.id === paletteId);
    if (!palette) return;
    const nextName = window.prompt('Palette name', palette.name)?.trim();
    if (!nextName) return;
    history.push({
      ...draft,
      customPalettes: draft.customPalettes.map((entry) =>
        entry.id === paletteId ? { ...entry, name: nextName } : entry,
      ),
    });
  };

  const importPalette = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const parsed = parseThemeImport(raw);
      if (!parsed.ok) {
        toast.error(parsed.error);
        return;
      }
      const stored = storedPaletteFromExport(parsed.palette, 'imported');
      history.push({
        ...draft,
        customPalettes: [...draft.customPalettes, stored],
        selectedPaletteId: stored.id,
        themeOverrides: null,
      });
      toast.success(`Imported ${stored.name}. Preview applied — save to keep it.`);
    } catch {
      toast.error('Could not read palette file.');
    }
  };

  const saveCurrentPalette = () => {
    const name = saveName.trim() || paletteDisplayName(draft);
    const exported = exportPaletteFromPreferences(draft, name);
    const stored: StoredPalette = {
      ...storedPaletteFromExport(exported, 'custom'),
      name,
    };
    history.push({
      ...draft,
      customPalettes: [...draft.customPalettes.filter((p) => p.id !== stored.id), stored],
      selectedPaletteId: stored.id,
      themeOverrides: null,
      themePreset: isBuiltinPaletteId(basePaletteId) ? basePaletteId : draft.themePreset,
    });
    setSaveDialogOpen(false);
    setSaveName('');
    toast.success(`Saved palette "${name}".`);
  };

  const currentOverrides =
    previewModeResolved === 'light' ? draft.themeOverrides?.light : draft.themeOverrides?.dark;

  return (
    <div className="theme-studio">
      <header className="theme-studio-header">
        <div>
          <h1>Appearance</h1>
          <p>Shape the color and typography of Cortex.</p>
        </div>
        <div className="theme-studio-header-actions">
          {hasUnsavedPaletteEdits ? (
            <span className="theme-unsaved-status" role="status">
              <span aria-hidden="true">●</span> Palette modified
            </span>
          ) : null}
          <button
            type="button"
            disabled={!history.canUndo}
            onClick={history.undo}
            aria-label="Undo"
          >
            <Undo2 aria-hidden="true" /> Undo
          </button>
          <button
            type="button"
            disabled={!history.canRedo}
            onClick={history.redo}
            aria-label="Redo"
          >
            <Redo2 aria-hidden="true" /> Redo
          </button>
          <button
            type="button"
            onClick={() => {
              if (hasUnsavedPaletteEdits && !window.confirm('Revert appearance changes?')) {
                return;
              }
              history.restoreSaved();
              toast.success('Appearance changes reverted.');
            }}
          >
            <RotateCcw aria-hidden="true" /> Revert changes
          </button>
          <button
            type="button"
            className="is-primary"
            disabled={!hasUnsavedPaletteEdits}
            onClick={() => {
              setSaveName(paletteDisplayName(draft).replace(/^Custom · based on /, ''));
              setSaveDialogOpen(true);
            }}
          >
            <Save aria-hidden="true" /> Save palette
          </button>
        </div>
      </header>

      <div className="theme-studio-layout">
        <div className="theme-studio-controls">
          <section className="theme-studio-section" id="interface-mode-section">
            <div className="theme-studio-row">
              <div>
                <span className="theme-section-label">Interface mode</span>
              </div>
              <Select
                id="interface-mode"
                ariaLabel="Interface mode"
                value={draft.colorMode}
                options={(['system', 'light', 'dark'] as const).map((mode) => ({
                  value: mode,
                  label: INTERFACE_MODE_LABELS[mode],
                }))}
                onChange={(value) => history.push({ ...draft, colorMode: value })}
              />
            </div>
          </section>

          <section className="theme-studio-section" id="palette">
            <PaletteSelector
              value={resolveActivePaletteId(draft)}
              options={paletteOptions}
              {...(customized ? { statusLabel: paletteDisplayName(draft) } : {})}
              onSelect={selectPalette}
              onDuplicate={duplicatePalette}
              onRename={renamePalette}
              onExport={exportPalette}
              onDelete={deletePalette}
              onImport={() => importRef.current?.click()}
            />
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importPalette(file);
                event.currentTarget.value = '';
              }}
            />
          </section>

          <section className="theme-studio-section" id="foundation">
            <header className="theme-section-header">
              <h2>Foundation</h2>
              <p>Core surfaces and text tokens for the active {previewModeResolved} variant.</p>
            </header>
            <div className="theme-token-grid">
              {FOUNDATION_TOKEN_KEYS.map((key) => (
                <div key={key}>
                  <ColorTokenField
                    tokenKey={key}
                    value={tokens[key]}
                    canReset={Boolean(currentOverrides?.[key])}
                    onChange={(value) => updateToken(key, value)}
                    onReset={() => resetToken(key)}
                  />
                  <p className="theme-token-help">{FOUNDATION_LABELS[key]}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="theme-studio-section">
            <button
              type="button"
              className="theme-disclosure-trigger"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <span>Advanced semantic colors</span>
              <ChevronDown aria-hidden="true" className={advancedOpen ? 'is-open' : ''} />
            </button>
            {advancedOpen ? (
              <div className="theme-token-grid is-compact" id="advanced-colors">
                {ADVANCED_TOKEN_KEYS.map((key) => (
                  <ColorTokenField
                    key={key}
                    tokenKey={key}
                    value={tokens[key]}
                    canReset={Boolean(currentOverrides?.[key])}
                    onChange={(value) => updateToken(key, value)}
                    onReset={() => resetToken(key)}
                  />
                ))}
              </div>
            ) : null}
          </section>

          <section className="theme-studio-section" id="typography">
            <header className="theme-section-header">
              <h2>Typography</h2>
            </header>
            <div className="theme-studio-stack">
              <div className="theme-studio-row">
                <div>
                  <span className="theme-section-label">Interface typeface</span>
                  <p className="theme-row-help">
                    Used throughout navigation, controls, and content.
                  </p>
                </div>
                <Select
                  id="interface-font"
                  value={draft.interfaceFont}
                  options={INTERFACE_FONTS.map((font) => ({
                    value: font.id,
                    label:
                      fontAvailability.get(font.id) === false
                        ? `${font.label} (not installed)`
                        : font.label,
                  }))}
                  onChange={(value) => history.push({ ...draft, interfaceFont: value })}
                />
              </div>
              <div className="theme-studio-row">
                <div>
                  <span className="theme-section-label">Code typeface</span>
                  <p className="theme-row-help">
                    Used for source, paths, manifests, identifiers, and diffs.
                  </p>
                </div>
                <Select
                  id="code-font"
                  value={draft.codeFont}
                  options={CODE_FONTS.map((font) => ({
                    value: font.id,
                    label:
                      fontAvailability.get(font.id) === false
                        ? `${font.label} (not installed)`
                        : font.label,
                  }))}
                  onChange={(value) => history.push({ ...draft, codeFont: value })}
                />
              </div>
              <div className="theme-studio-row">
                <span className="theme-section-label">Interface text scale</span>
                <Select
                  id="ui-font-size"
                  value={String(draft.uiFontSize)}
                  options={[13, 14, 15, 16, 17, 18].map((size) => ({
                    value: String(size),
                    label: `${size}px`,
                  }))}
                  onChange={(value) => history.push({ ...draft, uiFontSize: Number(value) })}
                />
              </div>
              <div className="theme-studio-row">
                <span className="theme-section-label">Editor text scale</span>
                <Select
                  id="editor-font-size"
                  value={String(draft.editorFontSize)}
                  options={Array.from({ length: 14 }, (_, index) => index + 11).map((size) => ({
                    value: String(size),
                    label: `${size}px`,
                  }))}
                  onChange={(value) => history.push({ ...draft, editorFontSize: Number(value) })}
                />
              </div>
              <div className="theme-studio-row">
                <div>
                  <span className="theme-section-label">Code ligatures</span>
                </div>
                <Toggle
                  id="code-ligatures"
                  name="codeLigatures"
                  checked={draft.codeLigatures}
                  onChange={(checked) => history.push({ ...draft, codeLigatures: checked })}
                />
              </div>
            </div>
          </section>

          <section className="theme-studio-section" id="readability">
            <header className="theme-section-header">
              <h2>Readability</h2>
            </header>
            <div className="theme-studio-row">
              <span className="theme-section-label">Interface contrast</span>
              <Select
                id="interface-contrast"
                value={draft.interfaceContrast}
                options={(['soft', 'balanced', 'crisp', 'maximum'] as const).map((level) => ({
                  value: level,
                  label: `${level.charAt(0).toUpperCase()}${level.slice(1)}`,
                }))}
                onChange={(value) =>
                  history.push({
                    ...draft,
                    interfaceContrast: value,
                  })
                }
              />
            </div>
            <button
              type="button"
              className="theme-disclosure-trigger"
              aria-expanded={contrastAdvancedOpen}
              onClick={() => setContrastAdvancedOpen((open) => !open)}
            >
              <span>Advanced</span>
              <ChevronDown aria-hidden="true" className={contrastAdvancedOpen ? 'is-open' : ''} />
            </button>
            {contrastAdvancedOpen ? (
              <label className="theme-slider-row">
                <span>Fine adjustment</span>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  value={draft.interfaceContrastFine}
                  onChange={(event) =>
                    history.push({ ...draft, interfaceContrastFine: Number(event.target.value) })
                  }
                />
                <output>{draft.interfaceContrastFine}</output>
              </label>
            ) : null}
            <div className="theme-studio-row">
              <div>
                <span className="theme-section-label">Protect text contrast</span>
                <p className="theme-row-help">
                  Automatically adjust Ink and Muted ink when backgrounds change.
                </p>
              </div>
              <Toggle
                id="protect-text-contrast"
                name="protectTextContrast"
                checked={draft.protectTextContrast}
                onChange={(checked) => history.push({ ...draft, protectTextContrast: checked })}
              />
            </div>
          </section>
        </div>

        <div className="theme-studio-aside">
          <ThemeStudioPreview
            mode={previewMode}
            onModeChange={setPreviewMode}
            tokens={tokens}
            preferences={draft}
            expanded={previewExpanded}
            onToggleExpand={() => setPreviewExpanded((value) => !value)}
          />
          {unsavedChanges.length > 0 ? (
            <UnsavedChangesSummary
              changes={unsavedChanges}
              onNavigate={scrollToSection}
              onUndo={history.undo}
            />
          ) : null}
        </div>
      </div>

      {saveDialogOpen ? (
        <dialog className="theme-save-dialog" open>
          <form
            method="dialog"
            onSubmit={(event) => {
              event.preventDefault();
              saveCurrentPalette();
            }}
          >
            <h2>Save palette</h2>
            <p>Store this customization locally on this device.</p>
            <label>
              Palette name
              <input
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                autoFocus
              />
            </label>
            <div className="theme-save-dialog-actions">
              <button type="button" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="is-primary">
                Save palette
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}

function UnsavedChangesSummary({
  changes,
  onNavigate,
  onUndo,
}: {
  changes: ThemeChange[];
  onNavigate: (sectionId: string) => void;
  onUndo: () => void;
}): React.JSX.Element {
  return (
    <div className="theme-unsaved-summary">
      <header>
        <strong>UNSAVED CHANGES · {changes.length}</strong>
        <button type="button" onClick={onUndo}>
          Undo one
        </button>
      </header>
      <ul>
        {changes.slice(0, 8).map((change) => (
          <li key={`${change.field}-${change.after}`}>
            <button type="button" onClick={() => onNavigate(change.sectionId ?? 'foundation')}>
              <span>{change.label}</span>
              <span>
                {change.before} → {change.after}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function patchTokenOverride(
  preferences: Preferences,
  mode: 'light' | 'dark',
  key: FoundationTokenKey | AdvancedTokenKey,
  value: string,
): Preferences {
  const baseId = resolveBasePaletteId(preferences);
  const current = preferences.themeOverrides ?? {
    basePaletteId: isBuiltinPaletteId(resolveActivePaletteId(preferences))
      ? resolveActivePaletteId(preferences)
      : baseId,
    light: {},
    dark: {},
  };
  const modeKey = mode === 'light' ? 'light' : 'dark';
  const modeOverrides: TokenOverrides = { ...(current[modeKey] ?? {}), [key]: value };
  return {
    ...preferences,
    themeOverrides: {
      ...current,
      basePaletteId: current.basePaletteId || baseId,
      [modeKey]: modeOverrides,
    },
  };
}

function clearTokenOverride(
  preferences: Preferences,
  mode: 'light' | 'dark',
  key: FoundationTokenKey | AdvancedTokenKey,
): Preferences {
  if (!preferences.themeOverrides) return preferences;
  const modeKey = mode === 'light' ? 'light' : 'dark';
  const nextMode = { ...(preferences.themeOverrides[modeKey] ?? {}) };
  Reflect.deleteProperty(nextMode, key);
  const hasKeys =
    Object.keys(nextMode).length > 0 ||
    Object.keys(preferences.themeOverrides[modeKey === 'light' ? 'dark' : 'light'] ?? {}).length >
      0;
  return {
    ...preferences,
    themeOverrides: hasKeys ? { ...preferences.themeOverrides, [modeKey]: nextMode } : null,
  };
}
