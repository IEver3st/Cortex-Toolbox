import { useQueryClient } from '@tanstack/react-query';
import {
  Accessibility,
  ArrowLeft,
  Blocks,
  Bot,
  Bug,
  Code2,
  Gauge,
  Info,
  Palette,
  PanelLeft,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
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
  type UpdateStatus,
} from '../../shared/contracts';
import { appBranding } from '../config/public-env';
import { brandIconUrl } from '../lib/brand-icon';
import { formatResultError, unwrap } from '../lib/result';
import { SectionPageHost } from './SectionPageHost';
import { applyPreferencesToDocument } from '../lib/themes';
import { ThemeStudio } from './theme-studio/ThemeStudio';
import { useModuleStore } from '../store/modules';
import { useWorkspaceStore } from '../store/workspace';
import { Select } from './Select';
import { SidebarOrderList } from './SidebarOrderList';
import { BugReportForm } from './BugReportForm';
import { ActionButton } from './ActionButton';
import { CortexMark, Toggle } from './UiPrimitives';
import {
  updateActionLabel,
  updateStatusDetail,
  updateStatusLabel,
  updateStatusTone,
  useUpdateStatus,
} from '../hooks/useUpdateStatus';
import { PREFERENCES_QUERY_KEY, usePreferences } from '../hooks/usePreferences';
import { AiSettingsPanel } from './settings/AiSettingsPanel';
import { AccountSettingsPanel } from './settings/AccountSettingsPanel';

type SectionId =
  | 'general'
  | 'appearance'
  | 'editor'
  | 'account'
  | 'ai'
  | 'modules'
  | 'sidebar'
  | 'accessibility'
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
    label: 'Cortex',
    items: [
      { id: 'account', label: 'Account', icon: UserRound, keywords: 'sign in plan billing usage' },
      {
        id: 'ai',
        label: 'AI',
        icon: Bot,
        keywords: 'cortex reasoning permissions workspace access privacy',
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
        label: 'Feedback',
        icon: Bug,
        keywords: 'bug feature module github issue logs diagnostics support feedback request',
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
  account: 'Account',
  ai: 'Cortex AI',
  modules: 'Modules',
  sidebar: 'Sidebar',
  accessibility: 'Accessibility',
  privacy: 'Privacy and data',
  support: 'Feedback',
  about: 'About',
};

const SECTION_LEAD: Partial<Record<SectionId, string>> = {
  account: 'Optional identity and managed AI access. Toolbox itself never requires an account.',
  ai: 'Choose whether Cortex AI exists in your workbench and exactly what it may do.',
  privacy:
    'How Cortex handles files, network access, and external tools on this device. These guarantees are built in and cannot be turned off.',
  support:
    'Send bug reports, feature requests, or module ideas to GitHub with optional diagnostic events from this session.',
  about: 'Version info, release updates, and licensing for this installation.',
};

function comparablePreferences(preferences: Preferences) {
  return { ...preferences, installedModules: [] as ModuleId[] };
}

function SettingsGroup({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <section className={`settings-card${className ? ` ${className}` : ''}`}>
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
          className={`settings-inline-status${statusTone === 'muted' ? ' is-muted' : ' is-success'}`}
          aria-label={`${label}: ${status}`}
        >
          <span className="settings-inline-status-dot" aria-hidden="true" />
          {status}
        </span>
      </div>
    </div>
  );
}

function ReleaseBranchPreview({ branch }: { branch: string }): React.JSX.Element {
  const isDeveloper = branch === 'developer';
  return (
    <div className="release-branch-preview">
      <img src={brandIconUrl(isDeveloper ? 'developer' : 'stable')} alt="" width={32} height={32} />
      <span>
        <strong>{isDeveloper ? 'Developer' : 'Stable'} channel</strong>
        <small>
          {isDeveloper
            ? 'Pre-release builds and the developer app icon.'
            : 'Production releases and the stable app icon.'}
        </small>
      </span>
    </div>
  );
}

function UpdatesPanel({
  updateStatus,
  releaseBranch,
  autoDownload,
  updateBusy,
  onAction,
}: {
  updateStatus: UpdateStatus | undefined;
  releaseBranch: string;
  autoDownload: boolean;
  updateBusy: boolean;
  onAction: (action: 'check' | 'download' | 'install') => void | Promise<void>;
}): React.JSX.Element {
  const phase = updateStatus?.phase ?? 'idle';
  const tone = updateStatusTone(updateStatus);
  const installedVersion = updateStatus?.currentVersion ?? appBranding.version;
  const targetVersion = updateStatus?.availableVersion;
  const hasTargetVersion =
    Boolean(targetVersion) &&
    (phase === 'available' || phase === 'downloading' || phase === 'ready');
  const action: 'check' | 'download' | 'install' | null =
    phase === 'disabled'
      ? null
      : phase === 'available'
        ? 'download'
        : phase === 'ready'
          ? 'install'
          : phase === 'downloading'
            ? null
            : 'check';
  const actionBusy = updateBusy || phase === 'checking';
  const progress =
    phase === 'downloading' && updateStatus?.progress != null
      ? Math.round(updateStatus.progress * 100)
      : null;
  const showReleaseNotes =
    Boolean(updateStatus?.releaseUrl) &&
    (phase === 'available' || phase === 'ready' || phase === 'uptodate');

  const openReleaseNotes = async () => {
    if (!updateStatus?.releaseUrl) return;
    const result = await window.cortex.system.openExternal({ url: updateStatus.releaseUrl });
    if (!result.ok) toast.error(formatResultError(result.error));
  };

  return (
    <div className="settings-update-panel">
      <div className="settings-update-head">
        <div className="settings-update-head-copy">
          <p className="settings-row-label">Software updates</p>
          <p className="settings-update-version" aria-label="Installed version">
            <span>v{installedVersion}</span>
            {hasTargetVersion && targetVersion ? (
              <>
                <span className="settings-update-arrow" aria-hidden="true">
                  →
                </span>
                <span className="settings-update-target">v{targetVersion}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="settings-update-head-action">
          {action ? (
            <ActionButton
              variant={action === 'check' ? 'default' : 'primary'}
              className="compact"
              busy={actionBusy}
              busyLabel={updateActionLabel(updateStatus, true)}
              disabled={actionBusy}
              onClick={() => onAction(action)}
            >
              {updateActionLabel(updateStatus, false)}
            </ActionButton>
          ) : null}
        </div>
      </div>
      <div className="settings-update-statusline">
        <span className={`settings-inline-status is-${tone}`} role="status" aria-live="polite">
          <span className="settings-inline-status-dot" aria-hidden="true" />
          <span>{updateStatusLabel(updateStatus)}</span>
        </span>
      </div>
      <p className="settings-update-detail">
        {updateStatusDetail(updateStatus, releaseBranch, appBranding.version, autoDownload)}
      </p>
      {progress != null ? (
        <div
          className="settings-update-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="Download progress"
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {showReleaseNotes ? (
        <button
          type="button"
          className="text-button compact settings-update-release-link"
          onClick={() => void openReleaseNotes()}
        >
          Release notes
        </button>
      ) : null}
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
  const [active, setActive] = useState<SectionId>(() => {
    const requested = globalThis.sessionStorage.getItem('cortex.settings.requestedSection');
    globalThis.sessionStorage.removeItem('cortex.settings.requestedSection');
    return requested === 'account' ? 'account' : 'general';
  });
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
  const installedVersion = updateStatus?.currentVersion ?? appBranding.version;

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
  const goBack = () => {
    if (!dirty) {
      activate(lastWorkbenchTab);
      return;
    }
    void persistDraft(draft)
      .then(() => activate(lastWorkbenchTab))
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Could not save settings.');
      });
  };

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
            name="settingsSearch"
            autoComplete="off"
            placeholder="Search settings…"
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

      <main
        className={`cursor-settings-main${active === 'appearance' ? ' is-theme-studio' : ''}${active === 'about' ? ' is-about' : ''}${active === 'support' ? ' is-support' : ''}`}
      >
        <SectionPageHost pageKey={active} className="cursor-settings-page-host" variant="settings">
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
              <>
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
                <SettingsGroup title="First-run setup">
                  <Row
                    label="Onboarding"
                    description="Review appearance, Cortex AI, account, reasoning, and permission choices again."
                    control={
                      <button type="button" onClick={() => update('onboardingVersion', 0)}>
                        Run onboarding again
                      </button>
                    }
                  />
                </SettingsGroup>
              </>
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
                      options={Array.from({ length: 14 }, (_, index) => index + 11).map(
                        (value) => ({
                          value: String(value),
                          label: `${value}px`,
                        }),
                      )}
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

            {active === 'account' ? <AccountSettingsPanel SettingsGroup={SettingsGroup} /> : null}

            {active === 'ai' ? (
              <AiSettingsPanel
                draft={draft}
                update={update}
                SettingsGroup={SettingsGroup}
                Row={Row}
                onOpenAccount={() => setActive('account')}
              />
            ) : null}

            {active === 'modules' ? (
              <SettingsGroup title="Available modules">
                <p className="settings-note">
                  Enable only the tools you use. Disabling a module closes its open tabs but does
                  not touch project files.
                </p>
                <div className="settings-module-list">
                  {MODULE_CATALOG.filter(
                    (module) => module.category !== 'system' || draft.experimentalTools,
                  ).map((module) => {
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

            {active === 'about' ? (
              <>
                <SettingsGroup title="Application" className="about-application-card">
                  <div className="about-application">
                    <div className="about-identity-row">
                      <div className="about-identity-mark">
                        <CortexMark size="large" />
                      </div>
                      <div className="about-identity-copy">
                        <h3>{appBranding.productName}</h3>
                        <p>Free tools for people who make things.</p>
                      </div>
                    </div>
                    <dl className="about-facts">
                      <div>
                        <dt>Version</dt>
                        <dd>v{installedVersion}</dd>
                      </div>
                      <div>
                        <dt>Channel</dt>
                        <dd>{appBranding.channel}</dd>
                      </div>
                      <div>
                        <dt>License</dt>
                        <dd>GPL-3.0</dd>
                      </div>
                    </dl>
                  </div>
                </SettingsGroup>
                <SettingsGroup title="Updates" className="about-updates-card">
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
                  <ReleaseBranchPreview branch={draft.releaseBranch} />
                  <UpdatesPanel
                    updateStatus={updateStatus}
                    releaseBranch={draft.releaseBranch}
                    autoDownload={draft.autoDownloadUpdates}
                    updateBusy={updateBusy}
                    onAction={runUpdateAction}
                  />
                </SettingsGroup>
              </>
            ) : null}

            {active === 'privacy' ? (
              <>
                <SettingsGroup title="Data handling">
                  <StatusRow
                    label="Cortex AI"
                    description={
                      draft.aiEnabled
                        ? 'Only requested context is sent to Cortex Cloud through protected workspace tools.'
                        : 'No workspace content is sent to Cortex Cloud.'
                    }
                    status={draft.aiEnabled ? 'Enabled' : 'Disabled'}
                    statusTone={draft.aiEnabled ? 'muted' : 'success'}
                  />
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
              <SettingsGroup title="Feedback">
                <BugReportForm />
              </SettingsGroup>
            ) : null}
          </div>
        </SectionPageHost>
      </main>
    </div>
  );
}
