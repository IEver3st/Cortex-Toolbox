/* eslint-disable @typescript-eslint/no-unused-vars -- Vite replaces these ambient build constants. */
import type { CortexApi } from './contracts';

declare const __CORTEX_RELEASE_CHANNEL__: string | undefined;
declare const __CORTEX_PRODUCT_NAME__: string | undefined;
declare const __CORTEX_IS_BETA__: boolean | undefined;
declare const __CORTEX_APP_VERSION__: string | undefined;

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    cortex: CortexApi;
  }
}
export {};
