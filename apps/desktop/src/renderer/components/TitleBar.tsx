import { AnimatePresence, m } from 'motion/react';
import {
  ArrowLeftRight,
  FileCode2,
  FolderOpen,
  FolderPlus,
  FolderX,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react';
import { toast } from 'sonner';
import { motionDurations, transition, useReducedMotion } from '../lib/motion';
import { copyText } from '../lib/clipboard';
import { useWorkspaceStore } from '../store/workspace';
import { ContextMenu } from './ContextMenu';
import { Tooltip } from './Tooltip';

const act = (action: 'minimize' | 'maximize' | 'close') => {
  void window.cortex.system.window({ action });
};

/** Windows 11-style caption glyphs — thin strokes, no filled boxes. */
function MinimizeIcon(): React.JSX.Element {
  return (
    <svg className="window-control-icon" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M2 6h8" />
    </svg>
  );
}

function MaximizeIcon(): React.JSX.Element {
  return (
    <svg className="window-control-icon" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="8" height="8" />
    </svg>
  );
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg className="window-control-icon" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
    </svg>
  );
}

export function TitleBar(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace);
  const closeWorkspace = useWorkspaceStore((state) => state.closeWorkspace);
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTab = useWorkspaceStore((state) => state.activeTab);
  const reduced = useReducedMotion();
  const settingsActive = (tabs.find((tab) => tab.id === activeTab) ?? tabs[0])?.kind === 'settings';
  const workspaceName =
    workspace?.project?.name ?? (workspace ? workspace.root.split(/[\\/]/).at(-1) : null);

  const openFolder = () => {
    void window.cortex.projects
      .open()
      .then((result) => result.ok && result.data && setWorkspace(result.data));
  };

  const copyWorkspacePath = async () => {
    if (!workspace) return;
    const ok = await copyText(workspace.root);
    if (ok) toast.success('Workspace path copied');
    else toast.error('Could not copy workspace path');
  };

  const closeActiveWorkspace = () => {
    void closeWorkspace().then((ok) => {
      if (ok) toast.success('Workspace closed');
      else toast.error('Could not close workspace');
    });
  };

  const workspaceButton = (
    <button
      type="button"
      className="titlebar-workspace-toggle"
      onClick={openFolder}
      aria-label={
        workspace ? `Active workspace ${workspaceName}. Switch workspace` : 'Open a resource folder'
      }
    >
      {workspace ? <ArrowLeftRight aria-hidden="true" /> : <FolderPlus aria-hidden="true" />}
    </button>
  );

  return (
    <header className={`titlebar${settingsActive ? ' is-settings' : ''}`}>
      <div className="titlebar-brand">
        {!settingsActive ? (
          <>
            <div className="titlebar-leading">
              <Tooltip
                content={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                side="bottom"
                delayMs={280}
              >
                <button
                  type="button"
                  className="titlebar-sidebar-toggle"
                  onClick={toggleSidebar}
                  aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  aria-expanded={!sidebarCollapsed}
                  aria-controls="sidebar-nav-body"
                >
                  {sidebarCollapsed ? (
                    <PanelLeft aria-hidden="true" />
                  ) : (
                    <PanelLeftClose aria-hidden="true" />
                  )}
                </button>
              </Tooltip>
              {workspace ? (
                <ContextMenu
                  label="Workspace actions"
                  items={[
                    {
                      id: 'switch',
                      label: 'Switch workspace…',
                      icon: FolderOpen,
                      onSelect: openFolder,
                    },
                    {
                      id: 'copy-path',
                      label: 'Copy path',
                      icon: FileCode2,
                      separator: true,
                      onSelect: () => void copyWorkspacePath(),
                    },
                    {
                      id: 'close',
                      label: 'Close workspace',
                      icon: FolderX,
                      onSelect: closeActiveWorkspace,
                    },
                  ]}
                >
                  <Tooltip content={workspaceName ?? 'Workspace'} side="bottom" delayMs={280}>
                    {workspaceButton}
                  </Tooltip>
                </ContextMenu>
              ) : (
                <Tooltip content="Open workspace" side="bottom" delayMs={280}>
                  {workspaceButton}
                </Tooltip>
              )}
            </div>
            <AnimatePresence initial={false} mode="wait">
              {workspaceName ? (
                <m.span
                  key={workspaceName}
                  className="titlebar-workspace"
                  initial={reduced ? false : { opacity: 0, transform: 'translateX(4px)' }}
                  animate={{ opacity: 1, transform: 'translateX(0)' }}
                  exit={
                    reduced
                      ? { opacity: 1, transform: 'translateX(0)' }
                      : { opacity: 0, transform: 'translateX(-3px)' }
                  }
                  transition={transition(motionDurations.fast, reduced)}
                >
                  <span className="titlebar-divider" aria-hidden="true" />
                  {workspaceName}
                </m.span>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </div>
      <div className="window-controls">
        <Tooltip content="Minimize" side="bottom" delayMs={420}>
          <button
            type="button"
            className="window-control"
            aria-label="Minimize window"
            onClick={() => act('minimize')}
          >
            <MinimizeIcon />
          </button>
        </Tooltip>
        <Tooltip content="Maximize" side="bottom" delayMs={420}>
          <button
            type="button"
            className="window-control"
            aria-label="Maximize window"
            onClick={() => act('maximize')}
          >
            <MaximizeIcon />
          </button>
        </Tooltip>
        <Tooltip content="Close" side="bottom" delayMs={420}>
          <button
            type="button"
            className="window-control window-close"
            aria-label="Close window"
            onClick={() => act('close')}
          >
            <CloseIcon />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
