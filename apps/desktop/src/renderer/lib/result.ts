import type { CortexError, Result } from '@cortex/core';

export function formatResultError(error: CortexError): string {
  if ((error.code === 'INVALID_REQUEST' || error.code === 'INVALID_RESPONSE') && error.details) {
    return error.details;
  }
  return error.message;
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(formatResultError(result.error));
  return result.data;
}
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
