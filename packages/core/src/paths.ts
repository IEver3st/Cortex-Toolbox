import path from 'node:path';

export function canonicalize(input: string): string {
  if (input.includes('\0')) throw new Error('Paths cannot contain null bytes.');
  return path.resolve(input);
}

export function assertWithinRoot(root: string, candidate: string): string {
  const safeRoot = canonicalize(root);
  const safeCandidate = canonicalize(candidate);
  const relative = path.relative(safeRoot, safeCandidate);
  if (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  ) {
    return safeCandidate;
  }
  throw new Error(`Path resolves outside the workspace: ${candidate}`);
}

export function normalizeRelative(input: string): string {
  const normalized = input.replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    normalized === '' ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Unsafe relative path: ${input}`);
  }
  return normalized;
}

export function archiveEntryDestination(root: string, entryName: string): string {
  return assertWithinRoot(root, path.join(root, normalizeRelative(entryName)));
}
