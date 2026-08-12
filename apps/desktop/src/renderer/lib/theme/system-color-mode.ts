import { useSyncExternalStore } from 'react';
import type { SystemColorMode } from '../../../shared/contracts';

let currentSystemColorMode: SystemColorMode | null = null;
const listeners = new Set<() => void>();

function fallbackSystemColorMode(): SystemColorMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getSystemColorMode(): SystemColorMode {
  return currentSystemColorMode ?? fallbackSystemColorMode();
}

export function setSystemColorMode(mode: SystemColorMode): void {
  if (currentSystemColorMode === mode) return;
  currentSystemColorMode = mode;
  for (const listener of listeners) listener();
}

export function subscribeSystemColorMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSystemColorMode(): SystemColorMode {
  return useSyncExternalStore(subscribeSystemColorMode, getSystemColorMode, getSystemColorMode);
}
