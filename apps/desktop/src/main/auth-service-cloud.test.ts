import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainEnv } from './config/env';

const mocks = vi.hoisted(() => {
  const secrets = new Map<string, string>();
  return { secrets };
});

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  shell: { openExternal: vi.fn(() => Promise.resolve()) },
}));

vi.mock('@workos-inc/node', () => ({
  createWorkOS: () => ({
    userManagement: {
      getAuthorizationUrlWithPKCE: vi.fn(),
      authenticateWithCode: vi.fn(),
      authenticateWithRefreshToken: vi.fn(),
    },
  }),
}));

vi.mock('./ai/secure-storage', () => ({
  secureSecrets: {
    set: (name: string, value: string) => mocks.secrets.set(name, value),
    get: (name: string) => mocks.secrets.get(name) ?? null,
    has: (name: string) => mocks.secrets.has(name),
    remove: (name: string) => mocks.secrets.delete(name),
    encryptionAvailable: () => true,
  },
}));

import { CortexAuthService } from './auth-service';

const USER = {
  id: 'user_01',
  email: 'jayson@example.com',
  firstName: 'Jayson',
  lastName: 'D',
  profilePictureUrl: null,
};

function env(): MainEnv {
  return {
    CORTEX_LOG_LEVEL: 'info',
    CORTEX_RELEASE_CHANNEL: 'development',
    CORTEX_GITHUB_OWNER: '',
    CORTEX_GITHUB_REPOSITORY: '',
    CORTEX_GITHUB_REPORT_TOKEN: '',
    CORTEX_GITHUB_REPORT_LABELS: '',
    CORTEX_ENABLE_AUTO_UPDATE: false,
    CORTEX_ENABLE_DEVTOOLS: false,
    CORTEX_CONVERTER_DIRECTORY: '',
    CORTEX_MAX_ARCHIVE_SIZE_MB: 2048,
    CORTEX_MAX_IMPORT_FILE_SIZE_MB: 1024,
    CORTEX_WORKOS_CLIENT_ID: 'client_01',
    CORTEX_WORKOS_CALLBACK_MODE: 'protocol',
    CORTEX_CLOUD_API_URL: 'https://cortex.example',
  };
}

function saveSession(): void {
  mocks.secrets.set(
    'workos-session',
    JSON.stringify({
      accessToken: token({ exp: 4_000_000_000, sid: 'session_01' }),
      refreshToken: 'refresh_01',
      user: USER,
    }),
  );
}

describe('hosted account session rejection', () => {
  beforeEach(() => {
    mocks.secrets.clear();
    vi.clearAllMocks();
    saveSession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('expires a locally valid session when Cortex Cloud rejects its access token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({ error: 'Your Cortex session expired. Sign in again.' }, { status: 401 }),
        ),
      ),
    );
    const service = new CortexAuthService(env());

    await expect(service.status()).resolves.toMatchObject({
      status: 'expired',
      identity: null,
      plan: null,
      message: 'Your Cortex session expired. Sign in again.',
    });
    expect(mocks.secrets.has('workos-session')).toBe(false);
  });

  it('retains the local identity for a transient hosted-service failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({ error: 'Cortex Cloud could not complete the request.' }, { status: 503 }),
        ),
      ),
    );
    const service = new CortexAuthService(env());

    await expect(service.status()).resolves.toMatchObject({
      status: 'signed-in',
      identity: { id: 'user_01', email: 'jayson@example.com' },
      plan: null,
      message: 'Cortex could not refresh plan and usage right now.',
    });
    expect(mocks.secrets.has('workos-session')).toBe(true);
  });
});

function token(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify({ client_id: 'client_01', ...payload })).toString('base64url')}.signature`;
}
