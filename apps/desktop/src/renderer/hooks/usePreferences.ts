import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type Preferences,
} from '../../shared/contracts';

export const PREFERENCES_QUERY_KEY = ['settings'] as const;

async function loadPreferences(): Promise<Preferences> {
  const result = await window.cortex.settings.get();
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
