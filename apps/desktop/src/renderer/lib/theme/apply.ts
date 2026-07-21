import type { Preferences } from '../../../shared/contracts';
import { contrastRatio } from './contrast';
import { resolveCodeFont, resolveInterfaceFont } from './fonts';
import { resolvedColorMode, resolveThemeTokens } from './resolve';

function setVar(root: HTMLElement, name: string, value: string): void {
  root.style.setProperty(name, value);
}

function applyTokenVariables(root: HTMLElement, preferences: Preferences): void {
  const mode = resolvedColorMode(preferences.colorMode);
  const tokens = resolveThemeTokens(preferences, mode);
  setVar(root, '--cortex-accent', tokens.signal);
  setVar(root, '--cortex-accent-hover', `color-mix(in srgb, ${tokens.signal} 88%, ${tokens.ink})`);
  setVar(
    root,
    '--cortex-accent-active',
    `color-mix(in srgb, ${tokens.signal} 84%, ${tokens.canvas})`,
  );
  setVar(
    root,
    '--cortex-on-accent',
    contrastRatio(tokens.signal, '#101510') >= contrastRatio(tokens.signal, '#f7faf7')
      ? '#101510'
      : '#f7faf7',
  );
  setVar(root, '--cortex-workspace', tokens.canvas);
  setVar(root, '--cortex-canvas', tokens.rail);
  setVar(root, '--cortex-sidebar', tokens.rail);
  setVar(root, '--cortex-surface-1', tokens.surface);
  setVar(root, '--cortex-surface-2', `color-mix(in srgb, ${tokens.surface} 94%, ${tokens.ink})`);
  setVar(root, '--cortex-surface-3', `color-mix(in srgb, ${tokens.surface} 89%, ${tokens.ink})`);
  setVar(root, '--cortex-text', tokens.ink);
  setVar(root, '--cortex-text-secondary', tokens.mutedInk);
  setVar(
    root,
    '--cortex-text-muted',
    `color-mix(in srgb, ${tokens.mutedInk} 82%, ${tokens.canvas})`,
  );
  setVar(
    root,
    '--cortex-text-disabled',
    `color-mix(in srgb, ${tokens.mutedInk} 52%, ${tokens.canvas})`,
  );
  setVar(root, '--cortex-border-control', `color-mix(in srgb, ${tokens.outline} 78%, transparent)`);
  setVar(root, '--cortex-border-soft', `color-mix(in srgb, ${tokens.outline} 50%, transparent)`);
  setVar(root, '--cortex-border-strong', tokens.outline);
  setVar(root, '--cortex-editor-canvas', tokens.editorCanvas);
  setVar(root, '--cortex-green', tokens.success);
  setVar(root, '--cortex-yellow', tokens.warning);
  setVar(root, '--cortex-red', tokens.error);
  setVar(root, '--cortex-blue', tokens.informational);
  setVar(root, '--cortex-aqua', tokens.diffAddition);
  setVar(root, '--cortex-syntax-selection', tokens.syntaxSelection);
  setVar(root, '--cortex-diff-addition', tokens.diffAddition);
  setVar(root, '--cortex-diff-removal', tokens.diffRemoval);
  setVar(root, '--cortex-selected', `color-mix(in srgb, ${tokens.signal} 14%, transparent)`);
  setVar(root, '--color-overlay', `color-mix(in srgb, ${tokens.rail} 78%, transparent)`);
  setVar(root, '--cortex-scrollbar-thumb', `color-mix(in srgb, ${tokens.signal} 26%, transparent)`);
  setVar(
    root,
    '--cortex-scrollbar-thumb-hover',
    `color-mix(in srgb, ${tokens.signal} 40%, transparent)`,
  );
  setVar(
    root,
    '--cortex-scrollbar-thumb-active',
    `color-mix(in srgb, ${tokens.signal} 52%, transparent)`,
  );
}

export function applyThemePreferences(preferences: Preferences): () => void {
  const root = document.documentElement;
  const applyMode = () => {
    root.dataset.mode = resolvedColorMode(preferences.colorMode);
    root.dataset.colorMode = preferences.colorMode;
    applyTokenVariables(root, preferences);
  };

  applyMode();
  root.dataset.theme = preferences.themePreset;
  root.dataset.reducedMotion = String(preferences.reducedMotion);
  root.dataset.pointerCursor = String(preferences.pointerCursor);
  root.dataset.sidebarDensity = preferences.sidebarDensity;
  root.dataset.sidebarCategoryLabels = String(preferences.sidebarCategoryLabels);
  root.dataset.codeLigatures = preferences.codeLigatures ? 'true' : 'false';
  root.style.fontSize = `${preferences.uiFontSize * preferences.interfaceScale}px`;
  root.style.setProperty('--editor-font-size', `${preferences.editorFontSize}px`);
  root.style.setProperty('--font-ui', resolveInterfaceFont(preferences.interfaceFont).family);
  root.style.setProperty('--font-mono', resolveCodeFont(preferences.codeFont).family);

  const media = window.matchMedia('(prefers-color-scheme: light)');
  if (preferences.colorMode === 'system') media.addEventListener('change', applyMode);
  return () => {
    media.removeEventListener('change', applyMode);
  };
}
