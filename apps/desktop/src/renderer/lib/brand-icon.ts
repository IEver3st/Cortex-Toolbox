import iconStable from '../../../assets/brand/icon.png';
import iconBeta from '../../../assets/brand/icon-beta.png';
import iconDev from '../../../assets/brand/icon-dev.png';
import { iconBaseNameForReleaseBranch, type ReleaseBranch } from '../../shared/branding';
import { appBranding } from '../config/public-env';

const BRAND_ICONS = {
  icon: iconStable,
  'icon-beta': iconBeta,
  'icon-dev': iconDev,
} as const;

export function brandIconUrl(releaseBranch: ReleaseBranch = 'stable'): string {
  const baseName =
    appBranding.channel === 'beta' ? 'icon-beta' : iconBaseNameForReleaseBranch(releaseBranch);
  return BRAND_ICONS[baseName];
}
