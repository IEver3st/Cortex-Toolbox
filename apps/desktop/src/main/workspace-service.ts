import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { createProject, migrateProject, type CortexProject } from '@cortex/project-schema';
import { safeWriteText } from '@cortex/core';
import {
  listResourceFiles,
  parseManifest,
  type ParsedManifest,
  type ResourceFile,
} from '@cortex/resource-parser';

export interface Workspace {
  root: string;
  temporary: boolean;
  project: CortexProject | null;
  manifestName: string | null;
}

export class WorkspaceService {
  #current: Workspace | null = null;
  #filesCache: { root: string; expiresAt: number; files: ResourceFile[] } | null = null;
  #filesPending: { root: string; promise: Promise<ResourceFile[]> } | null = null;
  current(): Workspace | null {
    return this.#current;
  }

  close(): void {
    this.#current = null;
    this.#clearFileCache();
  }

  async create(root: string, name: string, type: CortexProject['type']): Promise<Workspace> {
    this.#clearFileCache();
    await mkdir(root, { recursive: true });
    for (const directory of ['backups', 'cache', 'previews', 'indexes', 'logs'])
      await mkdir(path.join(root, '.cortex', directory), { recursive: true });
    const project = createProject(name, type);
    await safeWriteText(root, 'cortex.project.json', `${JSON.stringify(project, null, 2)}\n`);
    this.#current = {
      root,
      temporary: false,
      project,
      manifestName: await this.#findManifest(root),
    };
    return this.#current;
  }

  async open(root: string): Promise<Workspace> {
    this.#clearFileCache();
    let project: CortexProject | null = null;
    try {
      project = migrateProject(
        JSON.parse(await readFile(path.join(root, 'cortex.project.json'), 'utf8')) as unknown,
      );
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
    this.#current = {
      root,
      temporary: project === null,
      project,
      manifestName: await this.#findManifest(root),
    };
    return this.#current;
  }

  require(): Workspace {
    if (!this.#current) throw new Error('Open a project or folder before using this command.');
    return this.#current;
  }
  async files(): Promise<ResourceFile[]> {
    const root = this.require().root;
    if (this.#filesCache?.root === root && this.#filesCache.expiresAt > Date.now())
      return this.#filesCache.files;
    if (this.#filesPending?.root === root) return this.#filesPending.promise;

    const promise = listResourceFiles(root).then((files) => {
      this.#filesCache = { root, expiresAt: Date.now() + 5_000, files };
      return files;
    });
    this.#filesPending = { root, promise };
    try {
      return await promise;
    } finally {
      this.#clearPending(promise);
    }
  }
  invalidateFiles(): void {
    this.#clearFileCache();
  }
  async manifest(): Promise<{
    source: string;
    parsed: ParsedManifest;
    relativePath: string;
  } | null> {
    const workspace = this.require();
    if (!workspace.manifestName) return null;
    const source = await readFile(path.join(workspace.root, workspace.manifestName), 'utf8');
    return { source, parsed: parseManifest(source), relativePath: workspace.manifestName };
  }
  async #findManifest(root: string): Promise<string | null> {
    for (const name of ['fxmanifest.lua', '__resource.lua']) {
      try {
        await readFile(path.join(root, name));
        return name;
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      }
    }
    return null;
  }

  #clearFileCache(): void {
    this.#filesCache = null;
    this.#filesPending = null;
  }

  #clearPending(promise: Promise<ResourceFile[]>): void {
    if (this.#filesPending?.promise === promise) this.#filesPending = null;
  }
}
