import { useQuery } from '@tanstack/react-query';
import { Home, PackageCheck, Settings, Download } from 'lucide-react';
import { m } from 'motion/react';
import { useMemo } from 'react';
import type { ModuleId } from '../../shared/modules';
import { MODULE_BY_ID } from '../../shared/modules';
import { iconInteraction, useReducedMotion } from '../lib/motion';
import { unwrap } from '../lib/result';
import { useModuleStore } from '../store/modules';
import { useWorkspaceStore, type EditorTab } from '../store/workspace';
import { Tooltip } from './Tooltip';
import { MODULE_ICONS } from '../modules/registry';
import { useUpdateStatus } from '../hooks/useUpdateStatus';
import { usePreferences } from '../hooks/usePreferences';
import { toast } from 'sonner';

const systemLabels: Partial<Record<EditorTab['kind'], string>> = {
  welcome: 'Workspace overview',
  file: 'File',
  settings: 'Settings',
};

type NavGroupKey = 'workflow' | 'creative';

const NAV_GROUP_LABELS: Record<NavGroupKey, string> = {
  workflow: 'Primary workflow',
  creative: 'Creative tools',
};

function NavSectionHeader({ group }: { group: NavGroupKey }): React.JSX.Element {
  return (
    <h2 className="nav-section-label" data-nav-group={group}>
      {NAV_GROUP_LABELS[group]}
    </h2>
  );
}

export function ActivityRail(): React.JSX.Element {
  const reduced = useReducedMotion();
  const activate = useWorkspaceStore((state) => state.activate);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const setJobs = useWorkspaceStore((state) => state.setJobs);
  const jobsOpen = useWorkspaceStore((state) => state.jobsOpen);
  const workspace = useWorkspaceStore((state) => state.workspace);
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const installed = useModuleStore((state) => state.installed);
  const activeKind = useWorkspaceStore(
    (state) => state.tabs.find((tab) => tab.id === state.activeTab)?.kind,
  );
  const preferences = usePreferences();
  const experimental = preferences.data?.experimentalTools === true;

  const modulesByCategory = useMemo(
    () =>
      installed.reduce<
        Record<'workflow' | 'creative' | 'system', (typeof MODULE_BY_ID)[ModuleId][]>
      >(
        (groups, id) => {
          const module = MODULE_BY_ID[id];
          groups[module.category].push(module);
          return groups;
        },
        {
          workflow: [],
          creative: [],
          system: [],
        },
      ),
    [installed],
  );
  const {
    workflow: workflowModules,
    creative: creativeModules,
    system: systemModules,
  } = modulesByCategory;

  const open = (kind: EditorTab['kind']) => {
    if (kind === 'welcome') return activate('welcome');
    openTab({
      id: kind,
      label:
        kind in MODULE_BY_ID
          ? MODULE_BY_ID[kind as ModuleId].tabLabel
          : (systemLabels[kind] ?? kind),
      relativePath: kind === 'index' ? (workspace?.manifestName ?? 'fxmanifest.lua') : null,
      kind,
      dirty: false,
    });
  };
  const jobs = useQuery({
    queryKey: ['jobs', 'sidebar'],
    queryFn: async () => unwrap(await window.cortex.jobs.list()),
    refetchInterval: 2_000,
  });
  const jobCount = jobs.data?.length ?? 0;
  const updates = useUpdateStatus();
  const updateActionable = updates.data?.phase === 'available' || updates.data?.phase === 'ready';
  const updateReady = updates.data?.phase === 'ready';

  const runUpdateAction = async () => {
    try {
      if (updateReady) {
        unwrap(await window.cortex.updates.install());
        toast.success('Installer opened. Finish setup there, then relaunch Cortex.');
      } else {
        unwrap(await window.cortex.updates.download());
      }
      await updates.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not continue the update.');
    }
  };

  const item = (moduleId: ModuleId) => {
    const module = MODULE_BY_ID[moduleId];
    const Icon = MODULE_ICONS[moduleId];
    const kind = module.kind as EditorTab['kind'];
    const tooltip =
      !workspace && module.workspaceRequired
        ? 'Open a workspace to use this tool'
        : module.subtitle
          ? `${module.navLabel} — ${module.subtitle}`
          : module.navLabel;
    return (
      <Tooltip
        key={moduleId}
        content={tooltip}
        side={sidebarCollapsed ? 'right' : 'top'}
        delayMs={320}
      >
        <button
          type="button"
          className={activeKind === kind ? 'active' : ''}
          onClick={() => open(kind)}
          disabled={!workspace && module.workspaceRequired}
          aria-label={module.subtitle ? `${module.navLabel}, ${module.subtitle}` : module.navLabel}
          aria-current={activeKind === kind ? 'page' : undefined}
        >
          <Icon aria-hidden="true" />
          <span>
            {module.navLabel}
            {module.subtitle ? (
              <small className="nav-item-subtitle">{module.subtitle}</small>
            ) : null}
          </span>
        </button>
      </Tooltip>
    );
  };

  return (
    <nav
      className={sidebarCollapsed ? 'app-sidebar is-collapsed' : 'app-sidebar'}
      aria-label="Primary navigation"
      data-collapsed={sidebarCollapsed ? 'true' : 'false'}
    >
      <div id="sidebar-nav-body" className="sidebar-scroll">
        <section className="nav-section" aria-label="Overview">
          <div className="nav-section-items">
            <Tooltip content="Overview" side={sidebarCollapsed ? 'right' : 'top'} delayMs={320}>
              <button
                type="button"
                className={activeKind === 'welcome' ? 'active' : ''}
                onClick={() => open('welcome')}
                aria-label="Overview"
                aria-current={activeKind === 'welcome' ? 'page' : undefined}
              >
                <Home aria-hidden="true" />
                <span>Overview</span>
              </button>
            </Tooltip>
          </div>
        </section>

        {workflowModules.length > 0 && (
          <section className="nav-section" data-nav-group="workflow" aria-label="Primary workflow">
            <NavSectionHeader group="workflow" />
            <div className="nav-section-items">
              {workflowModules.map((module) => item(module.id))}
            </div>
          </section>
        )}

        {creativeModules.length > 0 && (
          <section className="nav-section" data-nav-group="creative" aria-label="Creator tools">
            <NavSectionHeader group="creative" />
            <div className="nav-section-items">
              {creativeModules.map((module) => item(module.id))}
            </div>
          </section>
        )}
      </div>

      <div className="sidebar-footer">
        {experimental && systemModules.length > 0 ? (
          <div className="sidebar-footer-extras">
            {systemModules.map((module) => item(module.id))}
          </div>
        ) : null}
        <div className="sidebar-footer-bar">
          <Tooltip content="Settings" side={sidebarCollapsed ? 'right' : 'top'}>
            <m.button
              type="button"
              onClick={() => open('settings')}
              className={
                activeKind === 'settings'
                  ? 'active sidebar-utility-icon settings-nav'
                  : 'sidebar-utility-icon settings-nav'
              }
              aria-label="Settings"
              aria-current={activeKind === 'settings' ? 'page' : undefined}
              {...iconInteraction(reduced)}
            >
              <Settings aria-hidden="true" />
            </m.button>
          </Tooltip>
          {updateActionable ? (
            <Tooltip
              content={
                updates.data?.availableVersion
                  ? `${updateReady ? 'Install' : 'Download'} version ${updates.data.availableVersion}`
                  : updateReady
                    ? 'Install update'
                    : 'Download update'
              }
              side={sidebarCollapsed ? 'right' : 'top'}
            >
              <m.button
                type="button"
                className="sidebar-utility-icon sidebar-update-icon"
                onClick={() => void runUpdateAction()}
                aria-label={
                  updates.data?.availableVersion
                    ? `${updateReady ? 'Install' : 'Download'} version ${updates.data.availableVersion}`
                    : updateReady
                      ? 'Install update'
                      : 'Download update'
                }
                {...iconInteraction(reduced)}
              >
                {updateReady ? (
                  <PackageCheck aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
              </m.button>
            </Tooltip>
          ) : null}
          <Tooltip
            content={jobCount > 0 ? `Activity (${jobCount})` : 'Activity'}
            side={sidebarCollapsed ? 'right' : 'top'}
          >
            <m.button
              type="button"
              className={jobsOpen ? 'active sidebar-utility-icon' : 'sidebar-utility-icon'}
              onClick={() => setJobs(true)}
              aria-label={jobCount > 0 ? `Activity, ${jobCount} jobs` : 'Activity'}
              aria-expanded={jobsOpen}
              {...iconInteraction(reduced)}
            >
              <PackageCheck aria-hidden="true" />
              {jobCount > 0 ? (
                <span className="nav-badge" aria-hidden="true">
                  {jobCount > 9 ? '9+' : jobCount}
                </span>
              ) : null}
            </m.button>
          </Tooltip>
        </div>
      </div>
    </nav>
  );
}
