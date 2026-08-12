import { describe, expect, it } from 'vitest';
import { brandingForChannel, resolveChannel } from './branding';

describe('branding', () => {
  it('keeps stable and beta product identities distinct for side-by-side installs', () => {
    const stable = brandingForChannel('stable');
    const beta = brandingForChannel('beta');
    expect(stable.productName).toBe('Cortex ToolBox');
    expect(beta.productName).toBe('Cortex ToolBox Beta');
    expect(stable.executableName).not.toBe(beta.executableName);
    expect(stable.appBundleId).not.toBe(beta.appBundleId);
    expect(stable.squirrelName).not.toBe(beta.squirrelName);
    expect(stable.iconBaseName).toBe('icon');
    expect(beta.iconBaseName).toBe('icon-beta');
    expect(beta.isBeta).toBe(true);
  });

  it('resolves unknown channel values to the fallback', () => {
    expect(resolveChannel('nightly', 'development')).toBe('development');
    expect(resolveChannel('beta')).toBe('beta');
  });
});
