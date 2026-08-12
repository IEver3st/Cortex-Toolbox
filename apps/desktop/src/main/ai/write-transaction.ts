export interface TextWriteTransactionEntry {
  root: string;
  relativePath: string;
  source: string;
  originalSource: string | null;
}

export async function applyTextWriteTransaction<T>(
  entries: TextWriteTransactionEntry[],
  write: (root: string, relativePath: string, source: string) => Promise<T>,
  removeCreated: (root: string, relativePath: string) => Promise<void>,
): Promise<T[]> {
  const applied: TextWriteTransactionEntry[] = [];
  const results: T[] = [];
  try {
    for (const entry of entries) {
      results.push(await write(entry.root, entry.relativePath, entry.source));
      applied.push(entry);
    }
    return results;
  } catch (error) {
    const rollbackFailures: string[] = [];
    for (const entry of [...applied].reverse()) {
      try {
        if (entry.originalSource === null) {
          await removeCreated(entry.root, entry.relativePath);
        } else {
          await write(entry.root, entry.relativePath, entry.originalSource);
        }
      } catch {
        rollbackFailures.push(entry.relativePath);
      }
    }
    if (rollbackFailures.length > 0) {
      throw new Error(
        `The change failed and rollback could not restore: ${rollbackFailures.join(', ')}. Recover from the .cortex backup files.`,
        { cause: error },
      );
    }
    throw error;
  }
}
