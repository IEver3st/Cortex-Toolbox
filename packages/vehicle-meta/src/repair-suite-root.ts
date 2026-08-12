import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const vendoredSuiteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../test-fixtures/vehicle-meta-repair-suite',
);

/** Root of the FiveM vehicle meta repair regression fixtures. */
export function repairSuiteRoot(): string {
  const fromEnv = process.env.CORTEX_VEHICLE_META_SUITE_ROOT?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return path.resolve(fromEnv);
  }
  return vendoredSuiteRoot;
}
