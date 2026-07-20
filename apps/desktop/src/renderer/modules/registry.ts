import { lazy, type LazyExoticComponent } from 'react';
import {
  Archive,
  Blocks,
  Braces,
  FileCode2,
  GitCompareArrows,
  Network,
  ImageDown,
  Radar,
  Siren,
  TriangleAlert,
  Waypoints,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ModuleId } from '../../shared/modules';

const LOADERS: Record<ModuleId, () => Promise<{ default: React.ComponentType }>> = {
  index: () => import('./index/index'),
  sentinel: () => import('./sentinel'),
  probe: () => import('./probe'),
  wire: () => import('./wire'),
  bundle: () => import('./bundle'),
  chassis: () => import('./chassis'),
  align: () => import('./align'),
  pulse: () => import('./pulse'),
  chevron: () => import('./chevron'),
  textures: () => import('./textures'),
  extensions: () => import('./extensions'),
};

export const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  index: FileCode2,
  sentinel: Radar,
  probe: Braces,
  wire: Network,
  bundle: Archive,
  chassis: Waypoints,
  align: GitCompareArrows,
  pulse: Siren,
  chevron: TriangleAlert,
  textures: ImageDown,
  extensions: Blocks,
};

export const MODULE_COMPONENTS = Object.fromEntries(
  Object.entries(LOADERS).map(([id, loader]) => [id, lazy(loader)]),
) as Record<ModuleId, LazyExoticComponent<React.ComponentType>>;

export function preloadModule(id: ModuleId): Promise<unknown> {
  return LOADERS[id]();
}
