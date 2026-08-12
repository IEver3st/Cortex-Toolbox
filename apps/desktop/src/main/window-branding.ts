import { existsSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, nativeImage } from 'electron';
import { iconBaseNameForReleaseBranch, type IconBaseName } from '../shared/branding';
import type { Preferences } from '../shared/contracts';

export function resolveAppIconPath(iconBaseName: IconBaseName): string | null {
  const fileName = `${iconBaseName}.ico`;
  const candidates = [
    path.join(app.getAppPath(), 'assets', 'brand', fileName),
    path.join(__dirname, '../../assets/brand', fileName),
    path.join(process.resourcesPath, `${iconBaseName}.png`),
    path.join(process.resourcesPath, fileName),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function applyReleaseBranchBranding(preferences: Preferences): void {
  const iconBaseName = iconBaseNameForReleaseBranch(preferences.releaseBranch);
  const iconPath = resolveAppIconPath(iconBaseName);
  if (!iconPath) return;
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) return;
  for (const window of BrowserWindow.getAllWindows()) {
    window.setIcon(icon);
  }
}
