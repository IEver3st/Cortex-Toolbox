import { create } from 'zustand';
import type { ModuleId } from '../../shared/modules';
import { MODULE_BY_ID, defaultInstalledModuleIds, isModuleInstalled } from '../../shared/modules';
import { normalizePreferences } from '../../shared/contracts';
import { unwrap } from '../lib/result';
import { preloadModule } from '../modules/registry';
import { useWorkspaceStore } from './workspace';

interface ModuleState {
  installed: ModuleId[];
  hydrated: boolean;
  setInstalled: (ids: ModuleId[]) => void;
  hydrateFromPreferences: (ids: ModuleId[]) => void;
  install: (id: ModuleId) => Promise<void>;
  uninstall: (id: ModuleId) => Promise<void>;
  move: (id: ModuleId, direction: -1 | 1) => Promise<void>;
  reorder: (fromId: ModuleId, toIndex: number) => Promise<void>;
  isInstalled: (id: ModuleId) => boolean;
}

function isReorderableModule(id: ModuleId): boolean {
  return MODULE_BY_ID[id].category !== 'system';
}

function reorderInstalledModules(
  installed: ModuleId[],
  fromId: ModuleId,
  toIndex: number,
): ModuleId[] | null {
  const reorderable = installed.filter(isReorderableModule);
  const fromIndex = reorderable.indexOf(fromId);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= reorderable.length || fromIndex === toIndex) {
    return null;
  }
  reorderable.splice(fromIndex, 1);
  reorderable.splice(toIndex, 0, fromId);
  let reorderableIndex = 0;
  return installed.map((id) => {
    if (!isReorderableModule(id)) return id;
    return reorderable[reorderableIndex++] ?? id;
  });
}

async function persistInstalled(installed: ModuleId[]): Promise<void> {
  const current = unwrap(await window.cortex.settings.get());
  unwrap(
    await window.cortex.settings.set(
      normalizePreferences({ ...current, installedModules: installed }),
    ),
  );
}

function closeTabsForModule(id: ModuleId): void {
  const module = MODULE_BY_ID[id];
  const { tabs, closeTab } = useWorkspaceStore.getState();
  for (const tab of tabs) {
    if (tab.kind === module.kind) closeTab(tab.id);
  }
}

export const useModuleStore = create<ModuleState>((set, get) => ({
  installed: defaultInstalledModuleIds(),
  hydrated: false,
  setInstalled: (installed) => set({ installed }),
  hydrateFromPreferences: (installed) => set({ installed, hydrated: true }),
  isInstalled: (id) => isModuleInstalled(get().installed, id),
  install: async (id) => {
    if (get().isInstalled(id)) return;
    const previous = get().installed;
    try {
      await preloadModule(id);
      const installed = [...previous, id];
      set({ installed });
      await persistInstalled(installed);
    } catch (error: unknown) {
      set({ installed: previous });
      throw new Error(`Could not install ${MODULE_BY_ID[id].name}.`, { cause: error });
    }
  },
  uninstall: async (id) => {
    if (!get().isInstalled(id)) return;
    const previous = get().installed;
    const installed = previous.filter((entry) => entry !== id);
    closeTabsForModule(id);
    set({ installed });
    try {
      await persistInstalled(installed);
    } catch (error: unknown) {
      set({ installed: previous });
      throw new Error(`Could not remove ${MODULE_BY_ID[id].name}.`, { cause: error });
    }
  },
  move: async (id, direction) => {
    const installed = [...get().installed];
    const index = installed.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= installed.length) return;
    const current = installed[index];
    const adjacent = installed[target];
    if (!current || !adjacent) return;
    installed[index] = adjacent;
    installed[target] = current;
    set({ installed });
    await persistInstalled(installed);
  },
  reorder: async (fromId, toIndex) => {
    const next = reorderInstalledModules(get().installed, fromId, toIndex);
    if (!next) return;
    set({ installed: next });
    await persistInstalled(next);
  },
}));
