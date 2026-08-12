import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { UpdateStatus } from '../../shared/contracts';
import { unwrap } from '../lib/result';

const QUERY_KEY = ['updates', 'status'] as const;

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => unwrap(await window.cortex.updates.status()),
    refetchInterval: (current) => {
      const phase = current.state.data?.phase;
      if (phase === 'checking' || phase === 'downloading') return 1000;
      return false;
    },
  });

  useEffect(() => {
    const unsubscribe = window.cortex.updates.onStatusChanged((status: UpdateStatus) => {
      queryClient.setQueryData(QUERY_KEY, status);
    });
    return unsubscribe;
  }, [queryClient]);

  return query;
}

export type UpdateStatusTone = 'success' | 'active' | 'warning' | 'error' | 'muted';

export function updateStatusTone(status: UpdateStatus | undefined): UpdateStatusTone {
  if (!status) return 'muted';
  switch (status.phase) {
    case 'available':
    case 'ready':
    case 'uptodate':
      return 'success';
    case 'checking':
    case 'downloading':
      return 'active';
    case 'error':
      return 'error';
    case 'disabled':
      return 'warning';
    default:
      return 'muted';
  }
}

export function updateStatusLabel(status: UpdateStatus | undefined): string {
  if (!status) return 'Checking…';
  switch (status.phase) {
    case 'disabled':
      return status.message ?? 'Unavailable';
    case 'idle':
      return 'Not checked yet';
    case 'checking':
      return 'Checking…';
    case 'available':
      return status.availableVersion
        ? `Version ${status.availableVersion} available`
        : 'Update available';
    case 'downloading':
      return status.progress != null
        ? `Downloading ${Math.round(status.progress * 100)}%`
        : 'Downloading…';
    case 'ready':
      return status.availableVersion
        ? `Version ${status.availableVersion} ready to install`
        : 'Ready to install';
    case 'uptodate':
      return 'Up to date';
    case 'error':
      return status.message ?? 'Update check failed';
    default:
      return status.message ?? 'Unknown';
  }
}

export function updateStatusDetail(
  status: UpdateStatus | undefined,
  branch: string,
  fallbackVersion: string,
  autoDownloadUpdates: boolean,
): string {
  const version = status?.currentVersion ?? fallbackVersion;
  const channel = branch === 'developer' ? 'developer' : 'stable';

  if (status?.phase === 'disabled') {
    return status.message ?? 'Updates are only available in the packaged desktop app.';
  }

  switch (status?.phase) {
    case 'available':
      return status.availableVersion
        ? `Version ${status.availableVersion} is available on the ${channel} channel.`
        : `A new release is available on the ${channel} channel.`;
    case 'ready':
      return 'Download complete. Restart Cortex to apply the update.';
    case 'downloading':
      return status.availableVersion
        ? `Downloading version ${status.availableVersion} from GitHub.`
        : 'Downloading the latest release from GitHub.';
    case 'checking':
      return `Checking the ${channel} channel on GitHub.`;
    case 'uptodate':
      return `Version ${version} is the latest on the ${channel} channel.`;
    case 'error':
      return status.message ?? 'Could not reach GitHub. Try again in a moment.';
    default:
      return autoDownloadUpdates
        ? `Installed version ${version}. Cortex checks GitHub in the background.`
        : `Installed version ${version}. Check manually when you want a new build.`;
  }
}

export function updateActionKind(
  status: UpdateStatus | undefined,
): 'check' | 'download' | 'install' | null {
  if (!status || status.phase === 'disabled') return null;
  if (status.phase === 'available') return 'download';
  if (status.phase === 'ready') return 'install';
  return 'check';
}

export function updateActionLabel(status: UpdateStatus | undefined, busy: boolean): string {
  if (busy) {
    if (status?.phase === 'checking') return 'Checking…';
    if (status?.phase === 'downloading') return 'Downloading…';
    return 'Working…';
  }
  switch (status?.phase) {
    case 'available':
      return 'Download';
    case 'ready':
      return 'Restart to update';
    case 'checking':
      return 'Checking…';
    case 'downloading':
      return 'Downloading…';
    default:
      return 'Check now';
  }
}
