import { z } from 'zod';
import { brandingForChannel, resolveChannel, type ReleaseChannel } from '../../shared/branding';

declare const __CORTEX_RELEASE_CHANNEL__: string | undefined;
declare const __CORTEX_PRODUCT_NAME__: string | undefined;
declare const __CORTEX_IS_BETA__: boolean | undefined;
declare const __CORTEX_APP_VERSION__: string | undefined;

const publicEnvSchema = z.object({ MODE: z.string(), DEV: z.boolean(), PROD: z.boolean() });
const rawEnvironment: unknown = (import.meta as ImportMeta & { readonly env: unknown }).env;
export const publicEnv = publicEnvSchema.parse(rawEnvironment);

const channel: ReleaseChannel = resolveChannel(
  typeof __CORTEX_RELEASE_CHANNEL__ === 'string' ? __CORTEX_RELEASE_CHANNEL__ : undefined,
  publicEnv.DEV ? 'development' : 'stable',
);
const brand = brandingForChannel(channel);

export const appBranding = {
  channel,
  productName:
    typeof __CORTEX_PRODUCT_NAME__ === 'string' ? __CORTEX_PRODUCT_NAME__ : brand.productName,
  isBeta: typeof __CORTEX_IS_BETA__ === 'boolean' ? __CORTEX_IS_BETA__ : brand.isBeta,
  wordmark: brand.wordmark,
  version: typeof __CORTEX_APP_VERSION__ === 'string' ? __CORTEX_APP_VERSION__ : '0.0.0',
};
