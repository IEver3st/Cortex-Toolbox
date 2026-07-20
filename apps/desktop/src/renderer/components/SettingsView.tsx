import { useQueryClient } from '@tanstack/react-query';
import {
  Accessibility,
  ArrowLeft,
  Blocks,
  Bug,
  Code2,
  Gauge,
  Info,
  Palette,
  PanelLeft,
  RotateCcw,
  Search,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { toast } from 'sonner';
import { MODULE_CATALOG, type ModuleId } from '../../shared/modules';
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type Preferences,
} from '../../shared/contracts';
import { appBranding } from '../config/public-env';
import { formatResultError, unwrap } from '../lib/result';
import { applyPreferencesToDocument } from '../lib/themes';
import { ThemeStudio } from './theme-studio/ThemeStudio';
import { useModuleStore } from '../store/modules';
import { useWorkspaceStore } from '../store/workspace';
import { Select } from './Select';
import { SidebarOrderList } from './SidebarOrderList';
import { BugReportForm } from './BugReportForm';
import { CortexMark, Toggle } from './UiPrimitives';
import { updateStatusLabel, useUpdateStatus } from '../hooks/useUpdateStatus';
import { PREFERENCES_QUERY_KEY, usePreferences } from '../hooks/usePreferences';

type SectionId =
  | 'general'
  | 'appearance'
  | 'editor'
  | 'modules'
  | 'sidebar'
  | 'accessibility'
  | 'integrations'
  | 'privacy'
  | 'support'
  | 'about';

interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  keywords: string;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Personal',
    items: [
      { id: 'general', label: 'General', icon: Gauge, keywords: 'scale pointer interface' },
      { id: 'appearance', label: 'Appearance', icon: Palette, keywords: 'theme light dark colors' },
      { id: 'editor', label: 'Editor', icon: Code2, keywords: 'font code size' },
      {
        id: 'accessibility',
        label: 'Accessibility',
        icon: Accessibility,
        keywords: 'motion reduce cursor',
      },
    ],
  },
  {
    label: 'Workbench',
    items: [
      { id: 'modules', label: 'Modules', icon: Blocks, keywords: 'enable disable tools install' },
      {
        id: 'sidebar',
        label: 'Sidebar',
        icon: PanelLeft,
        keywords: 'navigation order density category',
      },
      {
        id: 'integrations',
        label: 'External tools',
        icon: Wrench,
        keywords: 'ytd converter executable',
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        id: 'privacy',
        label: 'Privacy and data',
        icon: ShieldCheck,
        keywords: 'local telemetry offline',
      },
      {
        id: 'support',
        label: 'Report a Problem',
        icon: Bug,
        keywords: 'bug github issue logs diagnostics support feedback',
      },
      {
        id: 'about',
        label: 'About',
        icon: Info,
        keywords: 'version license channel updates release automatic',
      },
    ],
  },
];

const TITLES: Record<SectionId, string> = {
  general: 'General',
  appearance: 'Appearance',
  editor: 'Editor',
  modules: 'Modules',
  sidebar: 'Sidebar',
  accessibility: 'Accessibility',
  integrations: 'External tools',
  privacy: 'Privacy and data',
  support: 'Report a Problem',
  about: 'About',
};

const SECTION_LEAD: Partial<Record<SectionId, string>> = {
  privacy:
    'How Cortex handles files, network access, and external tools on this device. These guarantees are built in and cannot be turned off.',
  support:
    'Create a GitHub issue with your report and the diagnostic events captured in this Cortex session.',
  about: 'Version info, release updates, and licensing for this installation.',
};

function comparablePreferences(preferences: Preferences) {
  return { ...preferences, installedModules: [] as ModuleId[] };
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="settings-card">
      <h2 className="settings-card-title">{title}</h2>
      <div className="settings-card-body">{children}</div>
    </section>
  );
}

function Row({
  label,
  description,
  control,
  htmlFor,
}: {
  label: string;
  description?: string;
  control: ReactNode;
  htmlFor?: string;
}): React.JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <label
          id={htmlFor ? `${htmlFor}-label` : undefined}
          className="settings-row-label"
          htmlFor={htmlFor}
        >
          {label}
        </label>
        {description ? <p className="settings-row-description">{description}</p> : null}
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  );
}

function StatusRow({
  label,
  description,
  status,
  statusTone = 'success',
}: {
  label: string;
  description: string;
  status: string;
  statusTone?: 'success' | 'muted';
}): React.JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <p className="settings-row-label">{label}</p>
        <p className="settings-row-description">{description}</p>
      </div>
      <div className="settings-row-control">
        <span
          className={`settings-status-pill${statusTone === 'muted' ? ' is-muted' : ''}`}
          aria-label={`${label}: ${status}`}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

export function SettingsView(): React.JSX.Element {
  const queryClient = useQueryClient();
  const activate = useWorkspaceStore((state) => state.activate);
  const lastWorkbenchTab = useWorkspaceStore((state) => state.lastWorkbenchTab);
  const installed = useModuleStore((state) => state.installed);
  const install = useModuleStore((state) => state.install);
  const uninstall = useModuleStore((state) => state.uninstall);
  const [pendingModuleId, setPendingModuleId] = useState<ModuleId | null>(null);
  const installedIds = useMemo(() => new Set(installed), [installed]);
  const query = usePreferences();
  const [active, setActive] = useState<SectionId>('general');
  const [search, setSearch] = useState('');
  const [draftOverride, setDraftOverride] = useState<Preferences | null>(null);
  const saveRevision = useRef(0);
  const draft = draftOverride ?? query.data ?? normalizePreferences(DEFAULT_PREFERENCES);
  const setDraft = useCallback(
    (next: SetStateAction<Preferences>) => {
      setDraftOverride((current) => {
        const base = current ?? query.data ?? normalizePreferences(DEFAULT_PREFERENCES);
        return typeof next === 'function' ? next(base) : next;
      });
    },
    [query.data],
  );
  const [resetArmed, setResetArmed] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const updates = useUpdateStatus();
  const updateStatus = updates.data;

  useEffect(
    () => applyPreferencesToDocument({ ...draft, installedModules: installed }),
    [draft, installed],
  );

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return NAV_GROUPS;
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        `${item.label} ${item.keywords}`.toLowerCase().includes(value),
      ),
    })).filter((group) => group.items.length > 0);
  }, [search]);

  const saved = query.data ?? normalizePreferences(DEFAULT_PREFERENCES);
  const dirty =
    JSON.stringify(comparablePreferences(draft)) !== JSON.stringify(comparablePreferences(saved));
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const persistDraft = useCallback(
    async (preferences: Preferences) => {
      const revision = ++saveRevision.current;
      const result = await window.cortex.settings.set(
        normalizePreferences({
          ...preferences,
          installedModules: installed,
        }),
      );
      if (!result.ok) throw new Error(formatResultError(result.error));
      if (revision === saveRevision.current) {
        queryClient.setQueryData(PREFERENCES_QUERY_KEY, result.data);
        setDraftOverride((current) =>
          current &&
          JSON.stringify(comparablePreferences(current)) !==
            JSON.stringify(comparablePreferences(preferences))
            ? current
            : null,
        );
      }
      return result.data;
    },
    [installed, queryClient],
  );

  useEffect(() => {
    if (!query.isFetched || !dirty) return;
    const timer = window.setTimeout(() => {
      void persistDraft(draft).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Could not save settings.');
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, persistDraft, query.isFetched]);

  const restore = () => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    setDraft(normalizePreferences({ ...DEFAULT_PREFERENCES, installedModules: installed }));
    setResetArmed(false);
  };
  const goBack = () => activate(lastWorkbenchTab);

  const toggleModule = async (id: ModuleId, enabled: boolean) => {
    setPendingModuleId(id);
    try {
      if (enabled) await install(id);
      else await uninstall(id);
      await queryClient.invalidateQueries({ queryKey: PREFERENCES_QUERY_KEY });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the module.');
    } finally {
      setPendingModuleId((current) => (current === id ? null : current));
    }
  };

  const runUpdateAction = async (action: 'check' | 'download' | 'install') => {
    setUpdateBusy(true);
    try {
      if (action === 'check') {
        unwrap(await window.cortex.updates.check());
      } else if (action === 'download') {
        unwrap(await window.cortex.updates.download());
      } else {
        unwrap(await window.cortex.updates.install());
        toast.success('Installer opened. Finish setup there, then relaunch Cortex.');
      }
      await updates.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update action failed.');
    } finally {
      setUpdateBusy(false);
    }
  };

  const updateTone =
    updateStatus?.phase === 'error'
      ? 'muted'
      : updateStatus?.phase === 'available' || updateStatus?.phase === 'ready'
        ? 'success'
        : 'muted';

  return (
    <div className="cursor-settings tool-view">
      <aside className="cursor-settings-sidebar">
        <button type="button" className="settings-back" onClick={goBack}>
          <ArrowLeft aria-hidden="true" /> Back to app
        </button>
        <label className="settings-search-field">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder="Search settings"
            aria-label="Search settings"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <nav aria-label="Settings sections">
          {filtered.map((group) => (
            <div className="settings-nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={active === item.id ? 'is-active' : ''}
                  aria-current={active === item.id ? 'page' : undefined}
                  onClick={() => setActive(item.id)}
                >
                  <item.icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className={`cursor-settings-main${active === 'appearance' ? ' is-theme-studio' : ''}`}>
        {active !== 'appearance' ? (
          <header className="cursor-settings-main-header">
            <div>
              <h1>{TITLES[active]}</h1>
              <p>
                {SECTION_LEAD[active] ??
                  'Changes save automatically and stay local to this device.'}
              </p>
            </div>
            <div className="cursor-settings-main-actions">
              <button type="button" className={resetArmed ? 'is-armed' : ''} onClick={restore}>
                <RotateCcw aria-hidden="true" />{' '}
                {resetArmed ? 'Confirm restore' : 'Restore defaults'}
              </button>
            </div>
          </header>
        ) : null}

        <div
          className={`cursor-settings-content${active === 'appearance' ? ' is-theme-studio' : ''}`}
        >
          {active === 'appearance' ? (
            <ThemeStudio draft={draft} saved={saved} onChange={setDraft} />
          ) : null}

          {active === 'general' ? (
            <SettingsGroup title="Interface">
              <Row
                label="Interface scale"
                description="Scale navigation, controls, and workspace content together."
                htmlFor="interface-scale"
                control={
                  <Select
                    id="interface-scale"
                    value={String(draft.interfaceScale)}
                    options={[0.85, 0.9, 1, 1.1, 1.2, 1.3].map((value) => ({
                      value: String(value),
                      label: `${Math.round(value * 100)}%`,
                    }))}
                    onChange={(value) => update('interfaceScale', Number(value))}
                  />
                }
              />
              <Row
                label="UI font size"
                description="Set the base interface text size without changing code."
                htmlFor="ui-font-size"
                control={
                  <Select
                    id="ui-font-size"
                    value={String(draft.uiFontSize)}
                    options={[13, 14, 15, 16, 17, 18].map((value) => ({
                      value: String(value),
                      label: `${value}px`,
                    }))}
                    onChange={(value) => update('uiFontSize', Number(value))}
                  />
                }
              />
              <Row
                label="Pointer cursors"
                description="Use a pointer cursor on interactive controls."
                htmlFor="pointer-cursor"
                control={
                  <Toggle
                    id="pointer-cursor"
                    name="pointerCursor"
                    checked={draft.pointerCursor}
                    onChange={(value) => update('pointerCursor', value)}
                  />
                }
              />
            </SettingsGroup>
          ) : null}

          {active === 'editor' ? (
            <SettingsGroup title="Code editor">
              <Row
                label="Code font size"
                description="Set code size independently from the rest of the interface."
                htmlFor="editor-font-size"
                control={
                  <Select
                    id="editor-font-size"
                    value={String(draft.editorFontSize)}
                    options={Array.from({ length: 14 }, (_, index) => index + 11).map((value) => ({
                      value: String(value),
                      label: `${value}px`,
                    }))}
                    onChange={(value) => update('editorFontSize', Number(value))}
                  />
                }
              />
              <pre className="editor-preview" style={{ fontSize: draft.editorFontSize }}>
                <code>
                  <span>data_file</span> 'HANDLING_FILE' 'data/handling.meta'{`\n`}
                  <span>data_file</span> 'CARCOLS_FILE' 'data/carcols.meta'
                </code>
              </pre>
            </SettingsGroup>
          ) : null}

          {active === 'modules' ? (
            <SettingsGroup title="Available modules">
              <p className="settings-note">
                Enable only the tools you use. Disabling a module closes its open tabs but does not
                touch project files.
              </p>
              <div className="settings-module-list">
                {MODULE_CATALOG.filter((module) => module.category !== 'system').map((module) => {
                  const enabled = installedIds.has(module.id);
                  const busy = pendingModuleId === module.id;
                  return (
                    <div className="settings-module-row" key={module.id}>
                      <div>
                        <strong>{module.name}</strong>
                        <p>{module.description}</p>
                        <small>{module.tags.join(' · ')}</small>
                      </div>
                      <Toggle
                        id={`module-${module.id}`}
                        name={`module-${module.id}`}
                        ariaLabel={`${enabled ? 'Disable' : 'Enable'} ${module.name}`}
                        checked={enabled}
                        disabled={busy}
                        onChange={(value) => void toggleModule(module.id, value)}
                      />
                    </div>
                  );
                })}
              </div>
            </SettingsGroup>
          ) : null}

          {active === 'sidebar' ? (
            <>
              <SettingsGroup title="Behavior">
                <Row
                  label="Navigation density"
                  description="Compact mode reduces row height while keeping the same targets."
                  htmlFor="sidebar-density"
                  control={
                    <Select
                      id="sidebar-density"
                      value={draft.sidebarDensity}
                      options={[
                        { value: 'comfortable', label: 'Comfortable' },
                        { value: 'compact', label: 'Compact' },
                      ]}
                      onChange={(value) => update('sidebarDensity', value)}
                    />
                  }
                />
                <Row
                  label="Category labels"
                  description="Show Primary workflow and Creative tools headings when expanded."
                  htmlFor="sidebar-labels"
                  control={
                    <Toggle
                      id="sidebar-labels"
                      name="sidebarLabels"
                      checked={draft.sidebarCategoryLabels}
                      onChange={(value) => update('sidebarCategoryLabels', value)}
                    />
                  }
                />
              </SettingsGroup>
              <SettingsGroup title="Module order">
                <SidebarOrderList />
              </SettingsGroup>
            </>
          ) : null}

          {active === 'accessibility' ? (
            <SettingsGroup title="Motion">
              <Row
                label="Reduce interface motion"
                description="Removes workspace and panel movement while preserving immediate state feedback."
                htmlFor="reduced-motion"
                control={
                  <Toggle
                    id="reduced-motion"
                    name="reducedMotion"
                    checked={draft.reducedMotion}
                    onChange={(value) => update('reducedMotion', value)}
                  />
                }
              />
              <p className="settings-note">
                System reduced-motion preferences are also honored even when this setting is off.
              </p>
            </SettingsGroup>
          ) : null}

          {active === 'integrations' ? (
            <SettingsGroup title="YTD extraction">
              <Row
                label="YTDToolio executable"
                description="Optional local helper used only for YTD to ZIP extraction. DDS conversion is built in."
                htmlFor="ytd-tool-path"
                control={
                  <input
                    id="ytd-tool-path"
                    value={draft.ytdToolPath}
                    placeholder="C:\\Tools\\YTDToolio.exe"
                    onChange={(event) => update('ytdToolPath', event.target.value)}
                  />
                }
              />
              <p className="settings-note">
                Cortex never downloads or runs a converter silently. The exact executable path is
                stored locally and invoked only from Texture Converter.
              </p>
            </SettingsGroup>
          ) : null}

          {active === 'about' ? (
            <>
              <SettingsGroup title="Application">
                <div className="about-settings-row">
                  <CortexMark size="large" />
                  <div>
                    <h3>{appBranding.productName}</h3>
                    <p>Free tools for people who make things.</p>
                    <small>
                      Version {updateStatus?.currentVersion ?? appBranding.version} ·{' '}
                      {appBranding.channel} channel · GPL-3.0
                    </small>
                  </div>
                </div>
              </SettingsGroup>
              <SettingsGroup title="Updates">
                <Row
                  label="Automatic updates"
                  description="Check for new releases in the background and download them when available."
                  htmlFor="auto-download-updates"
                  control={
                    <Toggle
                      id="auto-download-updates"
                      name="autoDownloadUpdates"
                      checked={draft.autoDownloadUpdates}
                      onChange={(value) => update('autoDownloadUpdates', value)}
                    />
                  }
                />
                <Row
                  label="Release branch"
                  description="Stable is recommended for production work. Developer receives pre-release builds."
                  htmlFor="release-branch"
                  control={
                    <Select
                      id="release-branch"
                      value={draft.releaseBranch}
                      options={[
                        { value: 'stable', label: 'Stable' },
                        { value: 'developer', label: 'Developer' },
                      ]}
                      onChange={(value) => update('releaseBranch', value)}
                    />
                  }
                />
                <Row
                  label="Experimental tools"
                  description="Show extension tooling that may change between releases."
                  htmlFor="experimental-tools"
                  control={
                    <Toggle
                      id="experimental-tools"
                      name="experimentalTools"
                      checked={draft.experimentalTools}
                      onChange={(value) => update('experimentalTools', value)}
                    />
                  }
                />
                <StatusRow
                  label="Update status"
                  description={
                    updateStatus?.message ??
                    'Cortex checks GitHub releases for this build when automatic updates are enabled.'
                  }
                  status={updateStatusLabel(updateStatus)}
                  statusTone={updateTone}
                />
                {updateStatus?.phase === 'downloading' && updateStatus.progress != null ? (
                  <div
                    className="settings-update-progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(updateStatus.progress * 100)}
                  >
                    <span style={{ width: `${Math.round(updateStatus.progress * 100)}%` }} />
                  </div>
                ) : null}
                <div className="settings-update-actions">
                  <button
                    type="button"
                    disabled={
                      updateBusy ||
                      updateStatus?.phase === 'checking' ||
                      updateStatus?.phase === 'downloading'
                    }
                    onClick={() => void runUpdateAction('check')}
                  >
                    Check for updates
                  </button>
                  {updateStatus?.phase === 'available' ? (
                    <button
                      type="button"
                      className="is-primary"
                      disabled={updateBusy}
                      onClick={() => void runUpdateAction('download')}
                    >
                      Download update
                    </button>
                  ) : null}
                  {updateStatus?.phase === 'ready' ? (
                    <button
                      type="button"
                      className="is-primary"
                      disabled={updateBusy}
                      onClick={() => void runUpdateAction('install')}
                    >
                      Install and restart
                    </button>
                  ) : null}
                </div>
              </SettingsGroup>
            </>
          ) : null}

          {active === 'privacy' ? (
            <>
              <SettingsGroup title="Data handling">
                <StatusRow
                  label="Project files"
                  description="Read only from the workspace you choose."
                  status="Local"
                />
                <StatusRow
                  label="Telemetry"
                  description="No usage analytics or behavioral tracking."
                  status="Off"
                />
                <StatusRow
                  label="Core network access"
                  description="Validation, editing, conversion, and packaging run offline."
                  status="None"
                />
                <StatusRow
                  label="External tools"
                  description="Run only after explicit configuration and action."
                  status="Controlled"
                  statusTone="muted"
                />
              </SettingsGroup>
              <SettingsGroup title="Stored on this device">
                <StatusRow
                  label="Preferences"
                  description="Theme, layout, module order, and tool paths."
                  status="Local"
                />
                <StatusRow
                  label="Workspace cache"
                  description="Indexed resource metadata for the open workspace."
                  status="Local"
                />
              </SettingsGroup>
            </>
          ) : null}

          {active === 'support' ? (
            <SettingsGroup title="GitHub Issue Reporter">
              <BugReportForm />
            </SettingsGroup>
          ) : null}
        </div>
      </main>
    </div>
  );
}
