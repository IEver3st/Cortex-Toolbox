import { contextBridge, ipcRenderer } from 'electron';
// Sandboxed preload cannot load Node builtins. Import pure Result helpers only —
// the @cortex/core barrel re-exports fs/path/lockfile modules that crash preload.
import { fail, fromUnknown } from '@cortex/core/result';
import {
  channels,
  ipcDefinitions,
  updateStatusSchema,
  updatesChangedEvent,
  type Channel,
  type CortexApi,
  type IpcRequest,
  type IpcResponse,
} from '../shared/contracts';

async function invoke<C extends Channel>(
  channel: C,
  input: IpcRequest<C>,
): Promise<IpcResponse<C>> {
  try {
    const requestParsed = ipcDefinitions[channel].request.safeParse(input);
    if (!requestParsed.success) {
      return fail({
        code: 'INVALID_REQUEST',
        message: 'The request did not match the expected contract.',
        details: requestParsed.error.message,
      }) as IpcResponse<C>;
    }
    const response: unknown = await ipcRenderer.invoke(channel, requestParsed.data);
    const responseParsed = ipcDefinitions[channel].response.safeParse(response);
    if (responseParsed.success) return responseParsed.data as IpcResponse<C>;
    // Never throw Zod blobs into the renderer — settings and other views treat
    // Result errors as recoverable instead of crashing the query layer.
    return fail({
      code: 'INVALID_RESPONSE',
      message: 'The app returned data that did not match the expected contract.',
      details: responseParsed.error.message,
    }) as IpcResponse<C>;
  } catch (error: unknown) {
    return fail(fromUnknown(error, 'IPC_INVOKE_FAILED')) as IpcResponse<C>;
  }
}
const api: CortexApi = {
  projects: {
    create: (input) => invoke(channels.projectsCreate, input),
    open: () => invoke(channels.projectsOpen, {}),
    openPath: (input) => invoke(channels.projectsOpenPath, input),
    current: () => invoke(channels.projectsCurrent, {}),
    recent: () => invoke(channels.projectsRecent, {}),
    recentDetails: () => invoke(channels.projectsRecentDetails, {}),
    openFolder: (input) => invoke(channels.projectsOpenFolder, input),
    import: () => invoke(channels.projectsImport, {}),
    removeRecent: (input) => invoke(channels.projectsRemoveRecent, input),
    reveal: (input) => invoke(channels.projectsReveal, input),
    close: () => invoke(channels.projectsClose, {}),
  },
  files: {
    list: () => invoke(channels.filesList, {}),
    read: (input) => invoke(channels.filesRead, input),
    planWrite: (input) => invoke(channels.filesPlanWrite, input),
    applyWrite: (input) => invoke(channels.filesApplyWrite, input),
  },
  resources: {
    loadManifest: () => invoke(channels.manifestLoad, {}),
    audit: () => invoke(channels.auditRun, {}),
    previewPackage: (input) => invoke(channels.packagePreview, input),
    buildPackage: (input) => invoke(channels.packageBuild, input),
    summary: () => invoke(channels.workspaceSummary, {}),
    analyze: () => invoke(channels.analysisRun, {}),
    exportAnalysis: (input) => invoke(channels.analysisExport, input),
    assets: () => invoke(channels.assetsInventory, {}),
    processTexture: (input) => invoke(channels.texturesProcess, input),
    previewTexture: (input) => invoke(channels.texturesPreview, input),
    extractYtd: (input) => invoke(channels.texturesExtractYtd, input),
    exportWorkbench: (input) => invoke(channels.workbenchExport, input),
  },
  plugins: {
    list: () => invoke(channels.pluginsList, {}),
    grant: (input) => invoke(channels.pluginsGrant, input),
    openFolder: () => invoke(channels.pluginsOpenFolder, {}),
  },
  changes: {
    planManifest: (input) => invoke(channels.manifestPlan, input),
    applyManifest: (input) => invoke(channels.manifestApply, input),
  },
  jobs: {
    list: () => invoke(channels.jobsList, {}),
    cancel: (input) => invoke(channels.jobsCancel, input),
  },
  settings: {
    get: () => invoke(channels.settingsGet, {}),
    set: (input) => invoke(channels.settingsSet, input),
  },
  updates: {
    status: () => invoke(channels.updatesStatus, {}),
    check: () => invoke(channels.updatesCheck, {}),
    download: () => invoke(channels.updatesDownload, {}),
    install: () => invoke(channels.updatesInstall, {}),
    onStatusChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
        const parsed = updateStatusSchema.safeParse(raw);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(updatesChangedEvent, handler);
      return () => {
        ipcRenderer.removeListener(updatesChangedEvent, handler);
      };
    },
  },
  reports: {
    status: () => invoke(channels.reportsStatus, {}),
    submit: (input) => invoke(channels.reportsSubmit, input),
    recordClientError: (input) => invoke(channels.reportsRecordClientError, input),
  },
  system: {
    window: (input) => invoke(channels.systemWindow, input),
    openExternal: (input) => invoke(channels.systemExternal, input),
  },
};
contextBridge.exposeInMainWorld('cortex', Object.freeze(api));
