import type { Preferences } from '../../shared/contracts';
import { applyThemePreferences } from './theme/apply';

export { THEME_PRESETS } from './themes-presets';
export type { ThemePreset } from './themes-presets';

export function applyPreferencesToDocument(preferences: Preferences): () => void {
  return applyThemePreferences(preferences, {
    nativeBackdropSupported:
      typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows'),
  });
}
