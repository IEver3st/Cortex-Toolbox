import { describe, expect, it } from 'vitest';
import { createProject, migrateProject, projectSchema } from './index';

describe('project schema', () => {
  it('creates valid versioned projects', () =>
    expect(projectSchema.parse(createProject('My Resource', 'script')).schemaVersion).toBe(1));
  it('migrates version zero and preserves unknown fields', () => {
    const migrated = migrateProject({ schemaVersion: 0, name: 'Legacy', custom: { keep: true } });
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.custom).toEqual({ keep: true });
  });
  it('rejects empty names', () =>
    expect(() => projectSchema.parse(createProject('', 'script'))).toThrow());
});
