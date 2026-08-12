import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type Preferences,
} from '../../shared/contracts';
import { setSystemColorMode } from '../lib/theme/system-color-mode';

export const PREFERENCES_QUERY_KEY = ['settings'] as const;

async function loadPreferences(): Promise<Preferences> {
  const [result, systemColorMode] = await Promise.all([
    window.cortex.settings.get(),
    window.cortex.system.colorScheme().catch(() => null),
  ]);
  if (systemColorMode?.ok === true) setSystemColorMode(systemColorMode.data);
  return result.ok ? normalizePreferences(result.data) : normalizePreferences(DEFAULT_PREFERENCES);
}

export function preferencesQueryOptions() {
  return queryOptions({
    queryKey: PREFERENCES_QUERY_KEY,
    queryFn: loadPreferences,
    staleTime: Infinity,
  });
}

export function usePreferences() {
  return useQuery(preferencesQueryOptions());
}
