import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Command as CommandIcon, FolderOpen, Package, Search } from 'lucide-react';
import { toast } from 'sonner';
import { MODULE_BY_ID } from '../shared/modules';
import { ActivityRail } from './components/ActivityRail';
import { CommandPalette } from './components/CommandPalette';
import { JobsPanel } from './components/JobsPanel';
import { SectionPageHost } from './components/SectionPageHost';
import { StartView } from './components/StartView';
import { TitleBar } from './components/TitleBar';
import { Tooltip } from './components/Tooltip';
import { appBranding } from './config/public-env';
import { useModuleStore } from './store/modules';
import { useWorkspaceStore } from './store/workspace';
import { applyPreferencesToDocument } from './lib/themes';
import { ModuleView } from './modules/module-view';
import { preferencesQueryOptions } from './hooks/usePreferences';

function recordWorkspaceRenderError(error: Error, info: ErrorInfo): void {
  void window.cortex.reports.recordClientError({
    message: error.message || 'Workspace render error',
    stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`.trim() || null,
  });
}

const FileView = lazy(() =>
  import('./components/FileView').then((module) => ({ default: module.FileView })),
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((module) => ({ default: module.SettingsView })),
);

function WorkspaceLoading(): React.JSX.Element {
  return (
    <div className="view-loading" role="status" aria-live="polite">
      <span className="view-loading-bar" aria-hidden="true" />
      <strong>Opening tool…</strong>
      <span>Preparing only the workspace modules this tool needs.</span>
    </div>
  );
}

function WorkspaceTabHost({
  tabKey,
  children,
}: {
  tabKey: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <SectionPageHost pageKey={tabKey} className="workspace-tab-host" variant="workspace">
      {children}
    </SectionPageHost>
  );
}

interface BoundaryProps {
  children: ReactNode;
  tabId: string | undefined;
  recoveryKey: number;
  onRetryTab: () => void;
  onGoOverview: () => void;
}

interface BoundaryState {
  error: Error | null;
}

class WorkspaceErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Workspace render error', error, info.componentStack);
    recordWorkspaceRenderError(error, info);
  }

  override componentDidUpdate(prevProps: BoundaryProps): void {
    if (
      (prevProps.tabId !== this.props.tabId || prevProps.recoveryKey !== this.props.recoveryKey) &&
      this.state.error
    ) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="empty-state" role="alert">
          <h2>This view hit an error</h2>
          <p>{this.state.error.message || 'Something went wrong while rendering this tool.'}</p>
          <div className="header-actions" style={{ justifyContent: 'center', gap: '0.75rem' }}>
            <button type="button" className="primary" onClick={this.props.onRetryTab}>
              Retry view
            </button>
            <button type="button" onClick={this.props.onGoOverview}>
              Go to Overview
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App(): React.JSX.Element {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTab = useWorkspaceStore((state) => state.activeTab);
  const lastWorkbenchTab = useWorkspaceStore((state) => state.lastWorkbenchTab);
  const workspace = useWorkspaceStore((state) => state.workspace);
  const setPalette = useWorkspaceStore((state) => state.setPalette);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const activate = useWorkspaceStore((state) => state.activate);
  const setJobs = useWorkspaceStore((state) => state.setJobs);
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace);
  const setFiles = useWorkspaceStore((state) => state.setFiles);
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const hydrateModules = useModuleStore((state) => state.hydrateFromPreferences);
  const isModuleInstalled = useModuleStore((state) => state.isInstalled);
  const [viewRecoveryKey, setViewRecoveryKey] = useState(0);
  const tab = tabs.find((item) => item.id === activeTab) ?? tabs[0];
  const settingsActive = tab?.kind === 'settings';
  const workbenchTab = settingsActive
    ? (tabs.find((item) => item.id === lastWorkbenchTab) ?? tabs[0])
    : tab;
  const queryClient = useQueryClient();
  const workspaceName =
    workspace?.project?.name ?? (workspace ? workspace.root.split(/[\\/]/).at(-1) : null);
  const bridgeReady = Boolean(window.cortex.projects);

  useEffect(() => {
    document.title = workspaceName
      ? `${workspaceName} — ${appBranding.productName}`
      : appBranding.productName;
  }, [workspaceName]);
  useEffect(() => {
    if (!bridgeReady) return;
    void window.cortex.projects.current().then((result) => {
      if (result.ok) setWorkspace(result.data);
    });
  }, [bridgeReady, setWorkspace]);
  useEffect(() => {
    if (!bridgeReady) return;
    if (!workspace) {
      setFiles([]);
      return;
    }
    void window.cortex.files.list().then((result) => {
      if (result.ok) setFiles(result.data);
      else {
        setFiles([]);
        toast.error(result.error.message || 'Could not list workspace files.');
      }
    });
  }, [bridgeReady, setFiles, workspace]);
  useEffect(() => {
    if (!bridgeReady) return;
    let active = true;
    let dispose: (() => void) | undefined;
    void queryClient.ensureQueryData(preferencesQueryOptions()).then((preferences) => {
      if (!active) return;
      dispose = applyPreferencesToDocument(preferences);
      hydrateModules(preferences.installedModules);
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, [bridgeReady, hydrateModules, queryClient]);
  useEffect(() => {
    if (!bridgeReady) return;
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setPalette(true);
      }
      const shortcut =
        event.ctrlKey || event.metaKey
          ? ({ '1': 'index', '2': 'sentinel', '3': 'bundle' } as const)[event.key]
          : undefined;
      if (shortcut && isModuleInstalled(shortcut))
        openTab({
          id: shortcut,
          label: MODULE_BY_ID[shortcut].tabLabel,
          relativePath: shortcut === 'index' ? (workspace?.manifestName ?? 'fxmanifest.lua') : null,
          kind: shortcut,
          dirty: false,
        });
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [bridgeReady, isModuleInstalled, openTab, setPalette, workspace?.manifestName]);

  const goOverview = () => {
    setViewRecoveryKey((value) => value + 1);
    activate('welcome');
  };
  const retryTab = () => {
    setViewRecoveryKey((value) => value + 1);
  };

  const tabKind = workbenchTab?.kind;
  const tabModuleId =
    tabKind && tabKind !== 'welcome' && tabKind !== 'settings' && tabKind !== 'file'
      ? tabKind
      : null;
  const blockedModule =
    tabModuleId !== null && !isModuleInstalled(tabModuleId) ? MODULE_BY_ID[tabModuleId] : null;
  const moduleBlocked = blockedModule !== null;
  const overviewActive = !settingsActive && workbenchTab?.kind === 'welcome' && !workspace;

  if (!bridgeReady) {
    return (
      <div className="app-shell">
        <div className="empty-state" role="alert">
          <h2>Cortex could not start its desktop bridge</h2>
          <p>
            The preload script failed to load, so the workbench cannot talk to the local filesystem.
            Quit every Cortex window and restart with <code>pnpm dev</code> from the project root.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <TitleBar />
      <div
        className={`${sidebarCollapsed ? 'workbench is-sidebar-collapsed' : 'workbench'}${settingsActive ? ' is-settings' : ''}`}
      >
        {!settingsActive ? <ActivityRail /> : null}
        <main
          className={
            settingsActive
              ? 'workspace-area workspace-shell settings-shell-host'
              : `workspace-area workspace-shell${overviewActive ? ' is-shell-overview' : ''}`
          }
        >
          {!settingsActive && !overviewActive ? (
            <div className="workspace-toolbar">
              <div className="toolbar-location">
                <strong>{tab?.label ?? 'Workspace overview'}</strong>
              </div>
              <Tooltip content="Search" shortcut="Ctrl+K" side="bottom">
                <button
                  type="button"
                  className="command-trigger icon-button"
                  onClick={() => setPalette(true)}
                  aria-label="Search tools, commands, and files"
                >
                  <Search aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          ) : null}
          <div id="workspace-content" className="workspace-content" tabIndex={-1}>
            <Activity mode={settingsActive ? 'hidden' : 'visible'} name="workbench">
              <WorkspaceErrorBoundary
                tabId={workbenchTab?.id}
                recoveryKey={viewRecoveryKey}
                onRetryTab={retryTab}
                onGoOverview={goOverview}
              >
                <WorkspaceTabHost
                  tabKey={
                    workbenchTab?.kind === 'welcome'
                      ? `welcome-${viewRecoveryKey}`
                      : workbenchTab?.kind === 'file'
                        ? `file-${workbenchTab.relativePath ?? workbenchTab.id}-${viewRecoveryKey}`
                        : `${workbenchTab?.kind ?? 'none'}-${workbenchTab?.id ?? 'none'}-${viewRecoveryKey}`
                  }
                >
                  <Suspense fallback={<WorkspaceLoading />}>
                    {moduleBlocked && (
                      <div className="empty-state module-blocked">
                        <h2>Module not installed</h2>
                        <p>
                          {blockedModule.name} is not in your toolkit. Install it from Settings,
                          then open it again.
                        </p>
                        <div className="header-actions" style={{ justifyContent: 'center' }}>
                          <button type="button" className="primary" onClick={goOverview}>
                            Open Overview
                          </button>
                        </div>
                      </div>
                    )}
                    {!moduleBlocked && workbenchTab?.kind === 'welcome' && <StartView />}
                    {!moduleBlocked && tabModuleId && <ModuleView id={tabModuleId} />}
                    {!moduleBlocked && workbenchTab?.kind === 'file' && (
                      <FileView tab={workbenchTab} />
                    )}
                  </Suspense>
                </WorkspaceTabHost>
              </WorkspaceErrorBoundary>
            </Activity>
            <Activity mode={settingsActive ? 'visible' : 'hidden'} name="settings">
              <WorkspaceErrorBoundary
                tabId="settings"
                recoveryKey={viewRecoveryKey}
                onRetryTab={retryTab}
                onGoOverview={goOverview}
              >
                <Suspense fallback={<WorkspaceLoading />}>
                  <SettingsView />
                </Suspense>
              </WorkspaceErrorBoundary>
            </Activity>
          </div>
        </main>
      </div>
      <div className="compact-dock" aria-label="Compact window controls">
        <Tooltip content="Command palette" shortcut="Ctrl+K" side="top">
          <button type="button" onClick={() => setPalette(true)} aria-label="Open command palette">
            <CommandIcon aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip content="Background activity" side="top">
          <button type="button" onClick={() => setJobs(true)} aria-label="Open background activity">
            <Package aria-hidden="true" />
          </button>
        </Tooltip>
        {!workspace && (
          <Tooltip content="Open a resource folder" side="top">
            <button
              type="button"
              aria-label="Open workspace folder"
              onClick={() =>
                void window.cortex.projects
                  .open()
                  .then((result) => result.ok && result.data && setWorkspace(result.data))
                  .catch(() => toast.error('Could not open the workspace picker.'))
              }
            >
              <FolderOpen aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      <CommandPalette />
      <JobsPanel />
    </div>
  );
}
