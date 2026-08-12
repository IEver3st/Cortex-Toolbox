import { realpath } from 'node:fs/promises';
import path from 'node:path';

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function resolveAuthorizedProjectPath(
  requestedPath: string,
  activeRoot: string | null,
  recentRoots: string[],
): Promise<string> {
  const target = await realpath(path.resolve(requestedPath));

  if (activeRoot) {
    const active = await realpath(activeRoot);
    if (isWithinRoot(active, target)) return target;
  }

  for (const recentRoot of recentRoots) {
    try {
      if ((await realpath(recentRoot)) === target) return target;
    } catch {
      // Missing recent workspaces are not path capabilities.
    }
  }

  throw new Error(
    'Cortex can only open or reveal the active workspace, one of its folders, or a recent workspace.',
  );
}
