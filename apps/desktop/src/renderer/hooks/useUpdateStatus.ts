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
