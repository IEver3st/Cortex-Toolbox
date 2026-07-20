import { create } from 'zustand';
import type { z } from 'zod';
import type { resourceFileSchema } from '@cortex/resource-parser';
import type { workspaceSchema } from '../../shared/contracts';
import type { ModuleId } from '../../shared/modules';

export interface EditorTab {
  id: string;
  label: string;
  relativePath: string | null;
  kind: 'welcome' | ModuleId | 'file' | 'settings';
  dirty: boolean;
  content?: string;
  readOnly?: boolean;
}

export interface SessionValidation {
  at: string;
  errorCount: number;
  warningCount: number;
}

export interface SessionPackagePreview {
  at: string;
  fileCount: number;
}

export interface SessionAnalysis {
  at: string;
  scripts: number;
  lines?: number;
  events?: number;
  exports?: number;
  commands?: number;
}

const SIDEBAR_COLLAPSED_KEY = 'cortex.sidebarCollapsed';

function readSidebarCollapsed(): boolean {
  try {
    return globalThis.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    globalThis.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

interface WorkspaceState {
  workspace: z.infer<typeof workspaceSchema> | null;
  files: z.infer<typeof resourceFileSchema>[];
  tabs: EditorTab[];
  activeTab: string;
  lastWorkbenchTab: string;
  jobsOpen: boolean;
  paletteOpen: boolean;
  sidebarCollapsed: boolean;
  lastValidation: SessionValidation | null;
  lastPackagePreview: SessionPackagePreview | null;
  lastAnalysis: SessionAnalysis | null;
  setWorkspace: (workspace: z.infer<typeof workspaceSchema> | null) => void;
  closeWorkspace: () => Promise<boolean>;
  setFiles: (files: z.infer<typeof resourceFileSchema>[]) => void;
  openTab: (tab: EditorTab) => void;
  closeTab: (id: string) => void;
  activate: (id: string) => void;
  markDirty: (id: string, dirty: boolean) => void;
  setJobs: (open: boolean) => void;
  setPalette: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setLastValidation: (value: SessionValidation | null) => void;
  setLastPackagePreview: (value: SessionPackagePreview | null) => void;
  setLastAnalysis: (value: SessionAnalysis | null) => void;
  clearSessionReadiness: () => void;
}

const welcome: EditorTab = {
  id: 'welcome',
  label: 'Overview',
  relativePath: null,
  kind: 'welcome',
  dirty: false,
};

function sameRoot(
  current: z.infer<typeof workspaceSchema> | null,
  next: z.infer<typeof workspaceSchema> | null,
): boolean {
  if (!current || !next) return false;
  const normalize = (root: string) => root.replace(/[\\/]+$/, '').toLowerCase();
  return normalize(current.root) === normalize(next.root);
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: null,
  files: [],
  tabs: [welcome],
  activeTab: 'welcome',
  lastWorkbenchTab: 'welcome',
  jobsOpen: false,
  paletteOpen: false,
  sidebarCollapsed: readSidebarCollapsed(),
  lastValidation: null,
  lastPackagePreview: null,
  lastAnalysis: null,
  setWorkspace: (workspace) => {
    const current = get().workspace;
    if (sameRoot(current, workspace) && workspace) {
      set({ workspace });
      return;
    }
    set({
      workspace,
      tabs: [welcome],
      activeTab: 'welcome',
      lastWorkbenchTab: 'welcome',
      files: [],
      lastValidation: null,
      lastPackagePreview: null,
      lastAnalysis: null,
    });
  },
  closeWorkspace: async () => {
    const result = await window.cortex.projects.close();
    if (result.ok) get().setWorkspace(null);
    return result.ok;
  },
  setFiles: (files) => set({ files }),
  openTab: (tab) =>
    set((state) => ({
      tabs: state.tabs.some((item) => item.id === tab.id) ? state.tabs : [...state.tabs, tab],
      activeTab: tab.id,
      lastWorkbenchTab:
        tab.kind === 'settings'
          ? state.activeTab === 'settings'
            ? state.lastWorkbenchTab
            : state.activeTab
          : tab.id,
    })),
  closeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id);
      const fallbackWorkbenchTab =
        tabs.filter((tab) => tab.kind !== 'settings').at(-1)?.id ?? 'welcome';
      return {
        tabs: tabs.length ? tabs : [welcome],
        activeTab: state.activeTab === id ? (tabs.at(-1)?.id ?? 'welcome') : state.activeTab,
        lastWorkbenchTab:
          state.lastWorkbenchTab === id ? fallbackWorkbenchTab : state.lastWorkbenchTab,
      };
    }),
  activate: (activeTab) =>
    set((state) => ({
      activeTab,
      lastWorkbenchTab:
        state.tabs.find((tab) => tab.id === activeTab)?.kind === 'settings'
          ? state.lastWorkbenchTab
          : activeTab,
    })),
  markDirty: (id, dirty) =>
    set((state) => ({ tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, dirty } : tab)) })),
  setJobs: (jobsOpen) => set({ jobsOpen }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    writeSidebarCollapsed(sidebarCollapsed);
    set({ sidebarCollapsed });
  },
  toggleSidebar: () => {
    const sidebarCollapsed = !get().sidebarCollapsed;
    writeSidebarCollapsed(sidebarCollapsed);
    set({ sidebarCollapsed });
  },
  setLastValidation: (lastValidation) => set({ lastValidation }),
  setLastPackagePreview: (lastPackagePreview) => set({ lastPackagePreview }),
  setLastAnalysis: (lastAnalysis) => set({ lastAnalysis }),
  clearSessionReadiness: () =>
    set({ lastValidation: null, lastPackagePreview: null, lastAnalysis: null }),
}));
