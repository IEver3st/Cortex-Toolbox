import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { access, constants, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';
import Store from 'electron-store';
import {
  JobQueue,
  fail,
  fromUnknown,
  ok,
  planTextWrite,
  safeWriteText,
  assertWithinRoot,
  normalizeRelative,
} from '@cortex/core';
import {
  auditResource,
  createPackagePlan,
  evaluateReleaseGate,
  findMissingManifestReferences,
  type PackageEntry,
} from '@cortex/resource-parser';
import { analysisMarkdown } from '@cortex/script-analysis';
import { migrateProject } from '@cortex/project-schema';
import { pluginPermissionSchema } from '@cortex/plugin-sdk';
import fg from 'fast-glob';
import {
  channels,
  CURRENT_ONBOARDING_VERSION,
  DEFAULT_PREFERENCES,
  ipcDefinitions,
  normalizePreferences,
  type Channel,
  type IpcRequest,
  type IpcResponse,
  type Preferences,
  type RecentWorkspaceDetail,
} from '../shared/contracts';
import type { MainEnv } from './config/env';
import { writePackage } from './package-service';
import { WorkspaceService } from './workspace-service';
import { applyReleaseBranchBranding } from './window-branding';
import { UpdateService } from './update-service';
import {
  analyzeWorkspace,
  discoverPlugins,
  workspaceSummary,
  writeJsonExport,
} from './workspace-insights';
import { GitHubBugReportService, type DiagnosticsService } from './diagnostics-service';
import { CortexAiService } from './ai/ai-service';
import { resolveAiWorkspaceFile } from './ai/workspace-sandbox';
import type { CortexAuthService } from './auth-service';
import { applyTextWriteTransaction } from './ai/write-transaction';
import { removeLegacyAiCredential } from './ai/secure-storage';
import { resolveAuthorizedProjectPath } from './project-path-authorization';

const workspace = new WorkspaceService();
const jobs = new JobQueue();
interface PendingTextPlan {
  root: string;
  relativePath: string;
  source: string;
  beforeHash: string | null;
  allowCreate: boolean;
  createdAt: number;
}

const pendingPlans = new Map<string, PendingTextPlan>();
const MAX_PENDING_PLANS = 20;
const PENDING_PLAN_TTL_MS = 10 * 60 * 1_000;
const MAX_FILE_READ_BYTES = 10 * 1024 * 1024;
const TEXT_EDIT_EXTENSIONS = new Set([
  '.lua',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.json',
  '.cfg',
  '.xml',
  '.meta',
  '.md',
  '.txt',
  '.css',
  '.html',
  '.yml',
  '.yaml',
  '.toml',
]);

function assertEditableTextPath(relativePath: string): void {
  if (!TEXT_EDIT_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
    throw new Error('This file type is not available in the reviewed text editor.');
  }
}

interface PreflightTextPlan extends PendingTextPlan {
  planId: string;
  originalSource: string | null;
}

async function preflightPendingTextPlans(planIds: string[]): Promise<PreflightTextPlan[]> {
  if (new Set(planIds).size !== planIds.length) throw new Error('A change plan was repeated.');
  const active = workspace.require();
  const checked: PreflightTextPlan[] = [];
  const relativePaths = new Set<string>();
  for (const planId of planIds) {
    const pending = pendingPlans.get(planId);
    if (!pending) throw new Error('This change plan expired. Review the changes again.');
    if (Date.now() - pending.createdAt > PENDING_PLAN_TTL_MS) {
      pendingPlans.delete(planId);
      throw new Error('This change plan expired. Review the changes again.');
    }
    if (active.root !== pending.root) {
      throw new Error('The active workspace changed after this plan was created.');
    }
    if (relativePaths.has(pending.relativePath)) {
      throw new Error(`Multiple plans target ${pending.relativePath}.`);
    }
    relativePaths.add(pending.relativePath);
    const target = assertWithinRoot(
      pending.root,
      path.join(pending.root, normalizeRelative(pending.relativePath)),
    );
    let originalSource: string | null = null;
    try {
      originalSource = await readFile(target, 'utf8');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      if (!pending.allowCreate || pending.beforeHash !== null) {
        throw new Error('This reviewed change may only modify an existing file.', { cause: error });
      }
    }
    const currentHash =
      originalSource === null ? null : createHash('sha256').update(originalSource).digest('hex');
    if (currentHash !== pending.beforeHash) {
      throw new Error(
        'The file changed after this plan was reviewed. Review the latest file first.',
      );
    }
    checked.push({ ...pending, planId, originalSource });
  }
  return checked;
}

async function applyPendingTextPlans(planIds: string[]) {
  const checked = await preflightPendingTextPlans(planIds);
  for (const pending of checked) pendingPlans.delete(pending.planId);
  const results = await applyTextWriteTransaction(
    checked,
    safeWriteText,
    async (root, relativePath) => {
      const target = assertWithinRoot(root, path.join(root, normalizeRelative(relativePath)));
      await unlink(target);
    },
  );
  const active = workspace.require();
  workspace.invalidateFiles();
  await workspace.open(active.root);
  return results;
}

async function applyPendingTextPlan(planId: string) {
  const [result] = await applyPendingTextPlans([planId]);
  if (!result) throw new Error('The change plan did not produce a write result.');
  return result;
}

function rememberPendingPlan(
  plan: Awaited<ReturnType<typeof planTextWrite>>,
  root: string,
  relativePath: string,
  source: string,
  options: { allowCreate?: boolean } = {},
): void {
  const entry = plan.entries[0];
  if (!entry) throw new Error('The change plan did not contain a file entry.');
  for (const [id, pending] of pendingPlans) {
    if (Date.now() - pending.createdAt > PENDING_PLAN_TTL_MS) pendingPlans.delete(id);
  }
  while (pendingPlans.size >= MAX_PENDING_PLANS) {
    const oldest = pendingPlans.keys().next().value;
    if (!oldest) break;
    pendingPlans.delete(oldest);
  }
  pendingPlans.set(plan.id, {
    root,
    relativePath,
    source,
    beforeHash: entry.beforeHash,
    allowCreate: options.allowCreate === true,
    createdAt: Date.now(),
  });
}

const DEFAULT_PACKAGE_EXCLUDES = ['.cortex/**', '.cortex-write.lock', '*.zip', '*.sha256'] as const;

interface RecentWorkspace {
  root: string;
  name: string;
  openedAt: string;
}

const settingsFilePath = path.join(app.getPath('userData'), 'config.json');
const settingsExistedAtStartup = existsSync(settingsFilePath);
let settingsHadOnboardingVersion = false;
if (settingsExistedAtStartup) {
  try {
    const raw = JSON.parse(readFileSync(settingsFilePath, 'utf8')) as {
      preferences?: Record<string, unknown>;
    };
    settingsHadOnboardingVersion = Object.hasOwn(raw.preferences ?? {}, 'onboardingVersion');
  } catch {
    // A malformed store is repaired by readPreferences below.
  }
}

const settings = new Store<{
  preferences: Preferences;
  pluginGrants: Record<string, string[]>;
  recentWorkspaces: RecentWorkspace[];
}>({
  defaults: {
    preferences: { ...DEFAULT_PREFERENCES },
    pluginGrants: {},
    recentWorkspaces: [],
  },
});

let updates: UpdateService | null = null;

export function getUpdateService(): UpdateService | null {
  return updates;
}

export function readPreferences(): Preferences {
  try {
    const stored = settings.get('preferences');
    const value = normalizePreferences({
      ...stored,
      onboardingVersion: settingsHadOnboardingVersion
        ? stored.onboardingVersion
        : settingsExistedAtStartup
          ? CURRENT_ONBOARDING_VERSION
          : 0,
    });
    // Repair the on-disk store when keys are missing or invalid so future reads stay clean.
    if (JSON.stringify(stored) !== JSON.stringify(value)) {
      settings.set('preferences', value);
    }
    return value;
  } catch {
    try {
      settings.set('preferences', { ...DEFAULT_PREFERENCES });
    } catch {
      // If the store itself is unwritable, still return in-memory defaults.
    }
    return { ...DEFAULT_PREFERENCES };
  }
}

function register<C extends Channel>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    request: IpcRequest<C>,
  ) => Promise<IpcResponse<C>> | IpcResponse<C>,
): void {
  ipcMain.handle(channel, async (event, raw: unknown) => {
    try {
      const parsed = ipcDefinitions[channel].request.safeParse(raw);
      const response = parsed.success
        ? await handler(event, parsed.data as IpcRequest<C>)
        : fail({
            code: 'INVALID_REQUEST',
            message: 'The request did not match the expected contract.',
            details: parsed.error.message,
          });
      return ipcDefinitions[channel].response.parse(response);
    } catch (error: unknown) {
      return fail(fromUnknown(error, 'HANDLER_FAILED'));
    }
  });
}

function guarded<T>(operation: () => Promise<T>, code: string): Promise<IpcResponse<Channel>> {
  return operation()
    .then((data) => ok(data))
    .catch((error: unknown) => fail(fromUnknown(error, code))) as Promise<IpcResponse<Channel>>;
}

function workspaceDisplayName(active: { root: string; project: { name: string } | null }): string {
  return active.project?.name ?? (path.basename(active.root) || active.root);
}

function pushRecent(active: { root: string; project: { name: string } | null }): void {
  const entry: RecentWorkspace = {
    root: active.root,
    name: workspaceDisplayName(active),
    openedAt: new Date().toISOString(),
  };
  const existing = settings.get('recentWorkspaces');
  const next = [
    entry,
    ...existing.filter(
      (item) =>
        item.root.replace(/[\\/]+$/, '').toLowerCase() !==
        entry.root.replace(/[\\/]+$/, '').toLowerCase(),
    ),
  ].slice(0, 8);
  settings.set('recentWorkspaces', next);
}

function sameResolvedPath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

const scriptExtensions = new Set(['.lua', '.js', '.mjs', '.cjs', '.ts', '.tsx']);
const textureExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.dds',
  '.tga',
  '.psd',
  '.ytd',
]);
const modelExtensions = new Set(['.gltf', '.glb', '.ydr', '.ydd', '.yft']);

function deriveWorkspaceKind(input: {
  scripts: number;
  textures: number;
  models: number;
  total: number;
}): RecentWorkspaceDetail['kind'] {
  if (input.total === 0) return 'empty';
  const assets = input.textures + input.models;
  if (input.scripts === 0 && assets === 0) return 'empty';
  if (input.scripts > 0 && assets === 0) return 'script';
  if (assets > 0 && input.scripts === 0) return 'asset';
  if (input.scripts >= assets * 2) return 'script';
  if (assets >= input.scripts * 2) return 'asset';
  return 'mixed';
}

async function peekRecentEntry(entry: RecentWorkspace): Promise<RecentWorkspaceDetail> {
  const root = path.resolve(entry.root);
  const missing: RecentWorkspaceDetail = {
    ...entry,
    exists: false,
    hasManifest: false,
    projectType: null,
    kind: 'unknown',
  };
  try {
    await access(root, constants.F_OK);
    const info = await stat(root);
    if (!info.isDirectory()) return missing;
    let hasManifest = false;
    for (const name of ['fxmanifest.lua', '__resource.lua']) {
      try {
        await access(path.join(root, name), constants.F_OK);
        hasManifest = true;
        break;
      } catch {
        /* try next manifest name */
      }
    }
    let projectType: string | null = null;
    try {
      const project = migrateProject(
        JSON.parse(await readFile(path.join(root, 'cortex.project.json'), 'utf8')) as unknown,
      );
      projectType = project.type;
    } catch {
      /* optional cortex project metadata */
    }
    const files = await fg(['**/*'], {
      cwd: root,
      onlyFiles: true,
      deep: 4,
      dot: false,
      ignore: ['.cortex/**', 'node_modules/**', '.git/**'],
    });
    let scripts = 0;
    let textures = 0;
    let models = 0;
    for (const relativePath of files) {
      const ext = path.extname(relativePath).toLowerCase();
      if (scriptExtensions.has(ext)) scripts += 1;
      else if (textureExtensions.has(ext)) textures += 1;
      else if (modelExtensions.has(ext)) models += 1;
    }
    return {
      ...entry,
      exists: true,
      hasManifest,
      projectType,
      kind: deriveWorkspaceKind({ scripts, textures, models, total: files.length }),
    };
  } catch {
    return missing;
  }
}

async function openWorkspaceRoot(root: string): Promise<ReturnType<WorkspaceService['open']>> {
  const resolved = path.resolve(root);
  await access(resolved, constants.F_OK);
  const info = await stat(resolved);
  if (!info.isDirectory()) throw new Error(`That path is not a folder: ${resolved}`);
  const opened = await workspace.open(resolved);
  pushRecent(opened);
  return opened;
}

function mergePackageExcludes(excludes: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const pattern of [...excludes, ...DEFAULT_PACKAGE_EXCLUDES]) {
    if (seen.has(pattern)) continue;
    seen.add(pattern);
    merged.push(pattern);
  }
  return merged;
}

async function planPackage(
  active: { root: string; manifestName: string | null },
  includes: string[],
  excludes: string[],
): Promise<{ entries: PackageEntry[]; gate: { allowed: boolean; blockers: string[] } }> {
  const [files, manifest] = await Promise.all([workspace.files(), workspace.manifest()]);
  const entries = await createPackagePlan(
    active.root,
    files,
    includes,
    mergePackageExcludes(excludes),
  );
  const parsed = manifest?.parsed ?? null;
  const gate = evaluateReleaseGate({
    manifestName: active.manifestName,
    entries,
    hasParsedManifest: parsed != null,
    hasFxVersion: Boolean(parsed?.fxVersion),
    hasGame: Boolean(parsed?.game),
    missingManifestReferences: parsed ? findMissingManifestReferences(entries, parsed) : [],
  });
  return { entries, gate };
}

export function registerIpc(
  env: MainEnv,
  diagnostics: DiagnosticsService,
  cortexAuth: CortexAuthService,
): void {
  removeLegacyAiCredential();
  updates = new UpdateService(env, readPreferences);
  const bugReports = new GitHubBugReportService(env, diagnostics, () => ({
    appVersion: app.getVersion(),
    releaseChannel: env.CORTEX_RELEASE_CHANNEL,
    platform: process.platform,
    architecture: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    workspaceOpen: workspace.current() !== null,
  }));
  const cortexAi = new CortexAiService(
    readPreferences,
    () => workspace.require().root,
    () => workspace.files(),
    async (relativePath, source) => {
      const active = workspace.require();
      const resolved = await resolveAiWorkspaceFile(active.root, relativePath, { mustExist: true });
      assertEditableTextPath(resolved.relativePath);
      const plan = await planTextWrite(active.root, resolved.relativePath, source);
      rememberPendingPlan(plan, active.root, resolved.relativePath, source);
      return plan.id;
    },
    (planIds) => applyPendingTextPlans(planIds),
    () => cortexAuth.accessToken(),
    env.CORTEX_CLOUD_API_URL,
  );
  void updates.restorePendingDownload().then(() => updates?.initialize());
  register(channels.projectsCreate, async (event, request) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Choose the parent folder for this Cortex project',
      properties: ['openDirectory', 'createDirectory'],
    };
    const selected = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (selected.canceled || !selected.filePaths[0])
      return fail({ code: 'CANCELLED', message: 'Project creation was cancelled.' });
    const folderName = request.name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/^\.+|\.+$/g, '')
      .trim();
    if (!folderName)
      return fail({
        code: 'INVALID_REQUEST',
        message: 'Choose a project name with letters or numbers.',
      });
    const parent = path.resolve(selected.filePaths[0]);
    const root = path.resolve(parent, folderName);
    if (path.dirname(root) !== parent)
      return fail({
        code: 'INVALID_REQUEST',
        message: 'The project folder must stay inside the selected parent.',
      });
    return guarded(async () => {
      const created = await workspace.create(root, request.name, request.type);
      pushRecent(created);
      return created;
    }, 'PROJECT_CREATE_FAILED') as Promise<IpcResponse<'projects:create'>>;
  });
  register(channels.projectsOpen, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Open a Cortex project or FiveM resource folder',
      properties: ['openDirectory'],
    };
    const selected = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (selected.canceled || !selected.filePaths[0]) return ok(null);
    return guarded(async () => {
      const opened = await workspace.open(selected.filePaths[0] ?? '');
      pushRecent(opened);
      return opened;
    }, 'WORKSPACE_OPEN_FAILED') as Promise<IpcResponse<'projects:open'>>;
  });
  register(
    channels.projectsOpenPath,
    async (_event, request) =>
      guarded(async () => {
        const recent = settings
          .get('recentWorkspaces')
          .find((entry) => sameResolvedPath(entry.root, request.root));
        if (!recent)
          throw new Error('Open this folder manually before using it as a recent workspace.');
        const root = path.resolve(recent.root);
        try {
          await access(root, constants.F_OK);
        } catch {
          throw new Error(`That folder no longer exists: ${root}`);
        }
        const { stat } = await import('node:fs/promises');
        const info = await stat(root);
        if (!info.isDirectory()) throw new Error(`That path is not a folder: ${root}`);
        const opened = await workspace.open(root);
        pushRecent(opened);
        return opened;
      }, 'WORKSPACE_OPEN_FAILED') as Promise<IpcResponse<'projects:open-path'>>,
  );
  register(channels.projectsCurrent, () => ok(workspace.current()));
  register(channels.projectsClose, () => {
    pendingPlans.clear();
    workspace.close();
    return ok(null);
  });
  register(channels.projectsRecent, () => ok(settings.get('recentWorkspaces')));
  register(
    channels.projectsRecentDetails,
    () =>
      guarded(async () => {
        const recents = settings.get('recentWorkspaces');
        return Promise.all(recents.map((entry) => peekRecentEntry(entry)));
      }, 'RECENT_DETAILS_FAILED') as Promise<IpcResponse<'projects:recent-details'>>,
  );
  register(
    channels.projectsOpenFolder,
    async (_event, request) =>
      guarded(async () => {
        const root = await resolveAuthorizedProjectPath(
          request.root,
          workspace.current()?.root ?? null,
          settings.get('recentWorkspaces').map((entry) => entry.root),
        );
        return openWorkspaceRoot(root);
      }, 'WORKSPACE_OPEN_FAILED') as Promise<IpcResponse<'projects:open-folder'>>,
  );
  register(
    channels.projectsOpenDropped,
    async (_event, request) =>
      guarded(() => openWorkspaceRoot(request.root), 'WORKSPACE_OPEN_FAILED') as Promise<
        IpcResponse<'projects:open-dropped'>
      >,
  );
  register(channels.projectsImport, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Import a FiveM resource folder',
      properties: ['openDirectory'],
    };
    const selected = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (selected.canceled || !selected.filePaths[0]) return ok(null);
    return guarded(
      () => openWorkspaceRoot(selected.filePaths[0] ?? ''),
      'WORKSPACE_OPEN_FAILED',
    ) as Promise<IpcResponse<'projects:import'>>;
  });
  register(channels.projectsRemoveRecent, (_event, request) => {
    const next = settings
      .get('recentWorkspaces')
      .filter((item) => !sameResolvedPath(item.root, request.root));
    settings.set('recentWorkspaces', next);
    return ok(true);
  });
  register(channels.projectsReveal, async (_event, request) => {
    try {
      const target = await resolveAuthorizedProjectPath(
        request.root,
        workspace.current()?.root ?? null,
        settings.get('recentWorkspaces').map((entry) => entry.root),
      );
      const info = await stat(target);
      if (info.isDirectory()) {
        const error = await shell.openPath(target);
        if (error) throw new Error(error);
      } else {
        shell.showItemInFolder(target);
      }
      return ok(true);
    } catch (error) {
      return fail(fromUnknown(error, 'REVEAL_FAILED'));
    }
  });
  register(
    channels.filesList,
    () =>
      guarded(() => workspace.files(), 'FILE_LIST_FAILED') as Promise<IpcResponse<'files:list'>>,
  );
  register(
    channels.filesPickHandling,
    () =>
      guarded(async () => {
        const active = workspace.require();
        const selected = await dialog.showOpenDialog({
          title: 'Open handling.meta',
          defaultPath: active.root,
          properties: ['openFile'],
          filters: [
            { name: 'FiveM handling metadata', extensions: ['meta', 'xml'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });
        if (selected.canceled || !selected.filePaths[0]) return null;
        const target = assertWithinRoot(active.root, selected.filePaths[0]);
        const relativePath = normalizeRelative(path.relative(active.root, target));
        assertEditableTextPath(relativePath);
        const info = await stat(target);
        if (!info.isFile()) throw new Error('The selected path is not a file.');
        if (info.size > MAX_FILE_READ_BYTES) {
          throw new Error('This file is larger than the 10 MB in-app read limit.');
        }
        return { content: await readFile(target, 'utf8'), relativePath, readOnly: false as const };
      }, 'FILE_PICK_FAILED') as Promise<IpcResponse<'files:pick-handling'>>,
  );
  register(
    channels.filesRead,
    (_event, request) =>
      guarded(async () => {
        const active = workspace.require();
        const relativePath = normalizeRelative(request.relativePath);
        const target = assertWithinRoot(active.root, path.join(active.root, relativePath));
        const info = await stat(target);
        if (!info.isFile()) throw new Error('The selected path is not a file.');
        if (info.size > MAX_FILE_READ_BYTES) {
          throw new Error('This file is larger than the 10 MB in-app read limit.');
        }
        const content = await readFile(target, 'utf8');
        return {
          content,
          relativePath,
          readOnly: !TEXT_EDIT_EXTENSIONS.has(path.extname(relativePath).toLowerCase()),
        };
      }, 'FILE_READ_FAILED') as Promise<IpcResponse<'files:read'>>,
  );
  register(
    channels.filesPlanWrite,
    (_event, request) =>
      guarded(async () => {
        const active = workspace.require();
        const relativePath = normalizeRelative(request.relativePath);
        assertEditableTextPath(relativePath);
        const target = assertWithinRoot(active.root, path.join(active.root, relativePath));
        await access(target, constants.F_OK);
        const plan = await planTextWrite(active.root, relativePath, request.source);
        rememberPendingPlan(plan, active.root, relativePath, request.source);
        return plan;
      }, 'CHANGE_PLAN_FAILED') as Promise<IpcResponse<'files:plan-write'>>,
  );
  register(
    channels.filesPlanCreateHandling,
    (_event, request) =>
      guarded(async () => {
        const active = workspace.require();
        const relativePath = normalizeRelative(request.relativePath);
        if (path.basename(relativePath).toLowerCase() !== 'handling.meta') {
          throw new Error('New Chassis documents must be named handling.meta.');
        }
        assertEditableTextPath(relativePath);
        const target = assertWithinRoot(active.root, path.join(active.root, relativePath));
        try {
          await access(target, constants.F_OK);
          throw new Error(`${relativePath} already exists. Open it instead of replacing it.`);
        } catch (error) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
            throw error;
          }
        }
        const plan = await planTextWrite(active.root, relativePath, request.source);
        if (plan.entries[0]?.kind !== 'create') {
          throw new Error('The handling file appeared before the create plan was prepared.');
        }
        rememberPendingPlan(plan, active.root, relativePath, request.source, {
          allowCreate: true,
        });
        return plan;
      }, 'CHANGE_PLAN_FAILED') as Promise<IpcResponse<'files:plan-create-handling'>>,
  );
  register(
    channels.filesApplyWrite,
    (_event, request) =>
      guarded(() => applyPendingTextPlan(request.planId), 'CHANGE_APPLY_FAILED') as Promise<
        IpcResponse<'files:apply-write'>
      >,
  );
  register(
    channels.manifestLoad,
    () =>
      guarded(() => workspace.manifest(), 'MANIFEST_READ_FAILED') as Promise<
        IpcResponse<'manifest:load'>
      >,
  );
  register(
    channels.manifestPlan,
    (_event, request) =>
      guarded(async () => {
        const active = workspace.require();
        const relativePath = active.manifestName ?? 'fxmanifest.lua';
        const plan = await planTextWrite(active.root, relativePath, request.source);
        rememberPendingPlan(plan, active.root, relativePath, request.source, {
          allowCreate: active.manifestName === null,
        });
        return plan;
      }, 'CHANGE_PLAN_FAILED') as Promise<IpcResponse<'manifest:plan'>>,
  );
  register(
    channels.manifestApply,
    (_event, request) =>
      guarded(() => applyPendingTextPlan(request.planId), 'CHANGE_APPLY_FAILED') as Promise<
        IpcResponse<'manifest:apply'>
      >,
  );
  register(
    channels.auditRun,
    () =>
      guarded(async () => {
        const active = workspace.require();
        const configured = active.project?.preferences.auditSuppressions;
        const suppressions = Array.isArray(configured)
          ? configured.filter((value): value is string => typeof value === 'string')
          : [];
        const files = await workspace.files();
        const contentExtensions = new Set([
          '.json',
          '.lua',
          '.js',
          '.mjs',
          '.cjs',
          '.ts',
          '.tsx',
          '.txt',
          '.cfg',
          '.ini',
          '.yml',
          '.yaml',
          '.toml',
          '.env',
          '.md',
        ]);
        const fileContents: Record<string, string> = {};
        const candidates = files.filter(
          (file) =>
            file.bytes > 0 &&
            file.bytes <= 256_000 &&
            (contentExtensions.has(file.extension) ||
              file.name.startsWith('.env') ||
              /\.(pem|key)$/i.test(file.name)),
        );
        await Promise.all(
          candidates.slice(0, 200).map(async (file) => {
            try {
              const target = assertWithinRoot(
                active.root,
                path.join(active.root, normalizeRelative(file.relativePath)),
              );
              fileContents[file.relativePath] = await readFile(target, 'utf8');
            } catch {
              // Unreadable files are skipped; path-level rules still apply.
            }
          }),
        );
        return auditResource(
          files,
          (await workspace.manifest())?.parsed ?? null,
          active.manifestName,
          suppressions,
          fileContents,
        );
      }, 'AUDIT_FAILED') as Promise<IpcResponse<'audit:run'>>,
  );
  register(
    channels.packagePreview,
    (_event, request) =>
      guarded(async () => {
        const active = workspace.require();
        return planPackage(active, request.includes, request.excludes);
      }, 'PACKAGE_PLAN_FAILED') as Promise<IpcResponse<'package:preview'>>,
  );
  register(channels.packageBuild, async (event, request) => {
    try {
      const active = workspace.require();
      const { entries, gate } = await planPackage(active, request.includes, request.excludes);
      if (!gate.allowed) {
        return fail({
          code: 'PACKAGE_GATE_BLOCKED',
          message: 'Package build is blocked by the release gate.',
          details: gate.blockers.join('\n'),
          recovery: 'Resolve the blockers shown in the package dry run, then try again.',
        });
      }
      const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
      if (bytes > env.CORTEX_MAX_ARCHIVE_SIZE_MB * 1024 * 1024)
        throw new Error(
          `Selected files exceed the configured ${env.CORTEX_MAX_ARCHIVE_SIZE_MB} MB archive limit.`,
        );
      const owner = BrowserWindow.fromWebContents(event.sender);
      const options: SaveDialogOptions = {
        title: 'Export resource package',
        defaultPath: request.archiveName.endsWith('.zip')
          ? request.archiveName
          : `${request.archiveName}.zip`,
        filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
      };
      const selected = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (selected.canceled || !selected.filePath) return ok(null);
      const job = jobs.enqueue('package', `Build ${path.basename(selected.filePath)}`, (context) =>
        writePackage(active.root, selected.filePath, entries, context),
      );
      return ok(job);
    } catch (error) {
      return fail(fromUnknown(error, 'PACKAGE_BUILD_FAILED'));
    }
  });
  register(
    channels.workspaceSummary,
    () =>
      guarded(async () => {
        const active = workspace.require();
        return workspaceSummary(active.root, await workspace.files(), active.manifestName);
      }, 'WORKSPACE_SUMMARY_FAILED') as Promise<IpcResponse<'workspace:summary'>>,
  );
  register(
    channels.analysisRun,
    () =>
      guarded(async () => {
        const active = workspace.require();
        return analyzeWorkspace(active.root, await workspace.files());
      }, 'ANALYSIS_FAILED') as Promise<IpcResponse<'analysis:run'>>,
  );
  register(channels.analysisExport, async (event, request) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      const selected = owner
        ? await dialog.showSaveDialog(owner, {
            title: 'Export script evidence',
            defaultPath: 'cortex-script-evidence.md',
            filters: [{ name: 'Markdown', extensions: ['md'] }],
          })
        : await dialog.showSaveDialog({
            title: 'Export script evidence',
            defaultPath: 'cortex-script-evidence.md',
            filters: [{ name: 'Markdown', extensions: ['md'] }],
          });
      if (selected.canceled || !selected.filePath) return ok(null);
      const target = selected.filePath;
      const content = analysisMarkdown(request.analysis);
      try {
        await writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (code !== 'EEXIST') throw error;
        const confirm = owner
          ? await dialog.showMessageBox(owner, {
              type: 'warning',
              buttons: ['Overwrite', 'Cancel'],
              defaultId: 1,
              cancelId: 1,
              title: 'File already exists',
              message: `Replace existing file?\n${target}`,
              detail: 'Choosing Overwrite will replace the current file contents.',
            })
          : await dialog.showMessageBox({
              type: 'warning',
              buttons: ['Overwrite', 'Cancel'],
              defaultId: 1,
              cancelId: 1,
              title: 'File already exists',
              message: `Replace existing file?\n${target}`,
              detail: 'Choosing Overwrite will replace the current file contents.',
            });
        if (confirm.response !== 0) return ok(null);
        await writeFile(target, content, { encoding: 'utf8' });
      }
      try {
        shell.showItemInFolder(target);
      } catch {
        // Non-fatal: path is still returned to the renderer.
      }
      return ok(target);
    } catch (error) {
      return fail(fromUnknown(error, 'ANALYSIS_EXPORT_FAILED'));
    }
  });
  register(channels.workbenchExport, async (event, request) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      const defaultPath = `${request.name.replace(/[^a-zA-Z0-9._-]/g, '-')}.${request.kind}.json`;
      const options: SaveDialogOptions = {
        title: `Export ${request.kind} configuration`,
        defaultPath,
        filters: [{ name: 'Cortex JSON', extensions: ['json'] }],
      };
      const selected = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (selected.canceled || !selected.filePath) return ok(null);
      await writeJsonExport(selected.filePath, {
        schema: `cortex-${request.kind}-v1`,
        exportedAt: new Date().toISOString(),
        ...request.data,
      });
      return ok(selected.filePath);
    } catch (error) {
      return fail(fromUnknown(error, 'WORKBENCH_EXPORT_FAILED'));
    }
  });
  register(
    channels.pluginsList,
    () =>
      guarded(async () => {
        const active = workspace.require();
        const grants = settings.get('pluginGrants');
        return (await discoverPlugins(active.root)).map(({ manifest, source }) => ({
          manifest,
          source,
          valid: true,
          error: null,
          granted: (grants[manifest.id] ?? []).map((permission) =>
            pluginPermissionSchema.parse(permission),
          ),
        }));
      }, 'PLUGIN_DISCOVERY_FAILED') as Promise<IpcResponse<'plugins:list'>>,
  );
  register(channels.pluginsGrant, async (_event, request) => {
    try {
      const active = workspace.require();
      const plugin = (await discoverPlugins(active.root)).find(
        ({ manifest }) => manifest.id === request.pluginId,
      );
      if (!plugin) throw new Error('The plugin is no longer available in this workspace.');
      const declared = new Set(plugin.manifest.permissions);
      if (request.permissions.some((permission) => !declared.has(permission)))
        throw new Error('A plugin can only receive permissions declared in its manifest.');
      const grants = settings.get('pluginGrants');
      settings.set('pluginGrants', { ...grants, [plugin.manifest.id]: request.permissions });
      return ok(request.permissions);
    } catch (error) {
      return fail(fromUnknown(error, 'PLUGIN_PERMISSION_FAILED'));
    }
  });
  register(channels.pluginsOpenFolder, async () => {
    try {
      const active = workspace.require();
      const target = path.join(active.root, '.cortex', 'plugins');
      await mkdir(target, { recursive: true });
      const error = await shell.openPath(target);
      if (error) throw new Error(error);
      return ok(target);
    } catch (error) {
      return fail(fromUnknown(error, 'PLUGIN_FOLDER_OPEN_FAILED'));
    }
  });
  register(channels.jobsList, () => ok(jobs.list()));
  register(channels.jobsCancel, (_event, request) => ok(jobs.cancel(request.id)));
  register(channels.settingsGet, () => ok(readPreferences()));
  register(channels.settingsSet, (_event, request) => {
    try {
      const value = normalizePreferences(request);
      settings.set('preferences', value);
      settingsHadOnboardingVersion = true;
      applyReleaseBranchBranding(value);
      return ok(value);
    } catch (error: unknown) {
      return fail(fromUnknown(error, 'SETTINGS_WRITE_FAILED'));
    }
  });
  register(channels.aiChatStart, (event, request) => {
    try {
      return ok({ runId: cortexAi.start(request, event.sender) });
    } catch (error) {
      return fail(fromUnknown(error, 'AI_CHAT_START_FAILED'));
    }
  });
  register(channels.aiChatCancel, (_event, request) => ok(cortexAi.cancel(request.runId)));
  register(
    channels.aiPlanProposal,
    (_event, request) =>
      guarded(() => cortexAi.planProposal(request.proposal), 'AI_PROPOSAL_PLAN_FAILED') as Promise<
        IpcResponse<'ai:plan-proposal'>
      >,
  );
  register(
    channels.aiApplyProposal,
    (_event, request) =>
      guarded(() => applyPendingTextPlans(request.planIds), 'AI_PROPOSAL_APPLY_FAILED') as Promise<
        IpcResponse<'ai:apply-proposal'>
      >,
  );
  register(
    channels.accountStatus,
    () =>
      guarded(() => cortexAuth.status(), 'ACCOUNT_STATUS_FAILED') as Promise<
        IpcResponse<'account:status'>
      >,
  );
  register(
    channels.accountSignIn,
    () =>
      guarded(async () => {
        await cortexAuth.beginSignIn();
        return true;
      }, 'ACCOUNT_SIGN_IN_FAILED') as Promise<IpcResponse<'account:sign-in'>>,
  );
  register(
    channels.accountSignOut,
    () =>
      guarded(async () => {
        await cortexAuth.signOut();
        return true;
      }, 'ACCOUNT_SIGN_OUT_FAILED') as Promise<IpcResponse<'account:sign-out'>>,
  );
  register(
    channels.accountCheckout,
    (_event, request) =>
      guarded(async () => {
        await cortexAuth.checkout(request.plan, request.interval);
        return true;
      }, 'BILLING_CHECKOUT_FAILED') as Promise<IpcResponse<'account:checkout'>>,
  );
  register(
    channels.accountPortal,
    () =>
      guarded(async () => {
        await cortexAuth.portal();
        return true;
      }, 'BILLING_PORTAL_FAILED') as Promise<IpcResponse<'account:portal'>>,
  );
  register(channels.updatesStatus, () => {
    if (!updates) {
      return fail({ code: 'UPDATES_UNAVAILABLE', message: 'Updates are not initialized.' });
    }
    return ok(updates.getStatus());
  });
  register(
    channels.updatesCheck,
    () =>
      guarded(async () => {
        if (!updates) throw new Error('Updates are not initialized.');
        return updates.check();
      }, 'UPDATE_CHECK_FAILED') as Promise<IpcResponse<'updates:check'>>,
  );
  register(
    channels.updatesDownload,
    () =>
      guarded(async () => {
        if (!updates) throw new Error('Updates are not initialized.');
        return updates.download();
      }, 'UPDATE_DOWNLOAD_FAILED') as Promise<IpcResponse<'updates:download'>>,
  );
  register(
    channels.updatesInstall,
    () =>
      guarded(async () => {
        if (!updates) throw new Error('Updates are not initialized.');
        return updates.install();
      }, 'UPDATE_INSTALL_FAILED') as Promise<IpcResponse<'updates:install'>>,
  );
  register(channels.reportsStatus, () => ok(bugReports.status()));
  register(
    channels.reportsSubmit,
    (_event, request) =>
      guarded(() => bugReports.submit(request), 'BUG_REPORT_SUBMIT_FAILED') as Promise<
        IpcResponse<'reports:submit'>
      >,
  );
  register(channels.reportsRecordClientError, (_event, request) => {
    diagnostics.record(
      'error',
      `Renderer error: ${request.message}${request.stack ? `\n${request.stack}` : ''}`,
    );
    return ok(true);
  });
  register(channels.systemColorScheme, () =>
    ok(nativeTheme.shouldUseDarkColors ? ('dark' as const) : ('light' as const)),
  );
  register(channels.systemWindow, (event, request) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return ok(false);
    if (request.action === 'close') window.close();
    else if (request.action === 'minimize') window.minimize();
    else if (window.isMaximized()) window.unmaximize();
    else window.maximize();
    return ok(true);
  });
  register(channels.systemExternal, async (_event, request) => {
    const url = new URL(request.url);
    const approved = new Set(['github.com', 'docs.fivem.net']);
    if (url.protocol !== 'https:' || !approved.has(url.hostname))
      return fail({
        code: 'EXTERNAL_URL_BLOCKED',
        message: 'Cortex blocked a link outside its approved HTTPS destinations.',
      });
    await shell.openExternal(url.toString());
    return ok(true);
  });
}
