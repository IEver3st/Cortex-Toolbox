import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceService } from './workspace-service';

describe('workspace service', () => {
  it('opens ordinary folders without conversion', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-workspace-'));
    const service = new WorkspaceService();
    const workspace = await service.open(root);
    expect(workspace.temporary).toBe(true);
    expect(workspace.project).toBeNull();
  });
  it('creates portable projects and internal cache directories', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'cortex-project-'));
    const root = path.join(parent, 'fixture');
    const service = new WorkspaceService();
    const workspace = await service.create(root, 'Fixture', 'script');
    expect(workspace.project?.name).toBe('Fixture');
    expect(workspace.temporary).toBe(false);
  });
  it('closes the active workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-workspace-'));
    const service = new WorkspaceService();
    await service.open(root);
    expect(service.current()?.root).toBe(root);
    service.close();
    expect(service.current()).toBeNull();
    expect(() => service.require()).toThrow('Open a project or folder');
  });
});
