import path from 'node:path';
import { app, BrowserWindow, nativeImage, session } from 'electron';
import pino from 'pino';
import { brandingForChannel, iconBaseNameForReleaseBranch } from '../shared/branding';
import { loadEnv } from './config/env';
import { DiagnosticsService } from './diagnostics-service';
import { registerIpc, readPreferences } from './ipc';
import { resolveAppIconPath } from './window-branding';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const env = loadEnv();
const brand = brandingForChannel(env.CORTEX_RELEASE_CHANNEL);
const diagnostics = new DiagnosticsService();
const logger = pino(
  {
    level: env.CORTEX_LOG_LEVEL,
    redact: {
      paths: ['*.token', '*.password', '*.secret', '*.authorization'],
      censor: '[REDACTED]',
    },
  },
  {
    write(chunk) {
      diagnostics.capturePinoChunk(chunk);
      process.stdout.write(chunk);
    },
  },
);
const isDevelopment = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
const csp = isDevelopment
  ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws:; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
  : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

function createWindow(): BrowserWindow {
  const preferences = readPreferences();
  const iconBaseName = iconBaseNameForReleaseBranch(preferences.releaseBranch);
  const iconPath = resolveAppIconPath(iconBaseName);
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    title: brand.productName,
    backgroundColor: '#232A2E',
    ...(icon && !icon.isEmpty() ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDevelopment || env.CORTEX_ENABLE_DEVTOOLS,
    },
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => {
    const current = window.webContents.getURL();
    if (target !== current) event.preventDefault();
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else
    void window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  return window;
}

app
  .whenReady()
  .then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId(brand.appBundleId);
    }
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
      callback({
        responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
      }),
    );
    registerIpc(env, diagnostics);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    logger.info(
      { releaseChannel: env.CORTEX_RELEASE_CHANNEL, productName: brand.productName },
      'Cortex started',
    );
  })
  .catch((error: unknown) => {
    diagnostics.record(
      'error',
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    logger.fatal({ error }, 'Cortex failed to start');
    app.quit();
  });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
