import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainEnv } from './config/env';

const mocks = vi.hoisted(() => {
  const secrets = new Map<string, string>();
  return {
    secrets,
    openExternal: vi.fn(() => Promise.resolve()),
    authorization: vi.fn(() =>
      Promise.resolve({
        url: 'https://api.workos.com/user_management/authorize',
        state: 'state-abcdefghijklmnopqrstuvwxyz',
        codeVerifier: 'verifier-abcdefghijklmnopqrstuvwxyz',
      }),
    ),
    authenticateCode: vi.fn(),
    refresh: vi.fn(),
    logoutUrl: vi.fn(() => 'https://api.workos.com/logout'),
  };
});

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  shell: { openExternal: mocks.openExternal },
}));

vi.mock('@workos-inc/node', () => ({
  createWorkOS: () => ({
    userManagement: {
      getAuthorizationUrlWithPKCE: mocks.authorization,
      authenticateWithCode: mocks.authenticateCode,
      authenticateWithRefreshToken: mocks.refresh,
      getLogoutUrl: mocks.logoutUrl,
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

function env(overrides: Partial<MainEnv> = {}): MainEnv {
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
    CORTEX_CLOUD_API_URL: '',
    ...overrides,
  };
}

describe('WorkOS native public-client session', () => {
  beforeEach(() => {
    mocks.secrets.clear();
    vi.clearAllMocks();
    mocks.authenticateCode.mockResolvedValue({
      accessToken: token({ exp: 4_000_000_000, sid: 'session_01' }),
      refreshToken: 'refresh_01',
      user: USER,
    });
  });

  it('starts system-browser PKCE and never requires a client secret', async () => {
    const service = new CortexAuthService(env());
    await service.beginSignIn();

    expect(mocks.authorization).toHaveBeenCalledWith({
      provider: 'authkit',
      clientId: 'client_01',
      redirectUri: 'cortex-toolbox://auth/callback',
    });
    expect(mocks.openExternal).toHaveBeenCalledWith(
      'https://api.workos.com/user_management/authorize',
    );
    expect(JSON.parse(mocks.secrets.get('workos-pkce') ?? '{}')).toMatchObject({
      state: 'state-abcdefghijklmnopqrstuvwxyz',
      codeVerifier: 'verifier-abcdefghijklmnopqrstuvwxyz',
    });
  });

  it('rejects a callback whose OAuth state does not match', async () => {
    const service = new CortexAuthService(env());
    await service.beginSignIn();
    await expect(
      service.handleCallback('cortex-toolbox://auth/callback?code=code_01&state=forged-state'),
    ).rejects.toThrow('did not match');
    expect(mocks.authenticateCode).not.toHaveBeenCalled();
  });

  it('exchanges a valid code with its verifier and exposes only a typed identity summary', async () => {
    const service = new CortexAuthService(env());
    await service.beginSignIn();
    await service.handleCallback(
      'cortex-toolbox://auth/callback?code=code_01&state=state-abcdefghijklmnopqrstuvwxyz',
    );

    expect(mocks.authenticateCode).toHaveBeenCalledWith({
      clientId: 'client_01',
      code: 'code_01',
      codeVerifier: 'verifier-abcdefghijklmnopqrstuvwxyz',
    });
    const status = await service.status();
    expect(status).toMatchObject({
      status: 'signed-in',
      identity: { id: 'user_01', email: 'jayson@example.com', displayName: 'Jayson D' },
    });
    expect(JSON.stringify(status)).not.toContain('refresh_01');
    expect(JSON.stringify(status)).not.toContain('accessToken');
  });

  it('rotates an expired refresh token and signs out through the WorkOS session', async () => {
    mocks.secrets.set(
      'workos-session',
      JSON.stringify({
        accessToken: token({ exp: 1, sid: 'session_old' }),
        refreshToken: 'refresh_old',
        user: USER,
      }),
    );
    mocks.refresh.mockResolvedValue({
      accessToken: token({ exp: 4_000_000_000, sid: 'session_new' }),
      refreshToken: 'refresh_new',
      user: USER,
    });
    const service = new CortexAuthService(env());

    expect((await service.status()).status).toBe('signed-in');
    expect(mocks.refresh).toHaveBeenCalledWith({
      clientId: 'client_01',
      refreshToken: 'refresh_old',
    });
    expect(mocks.secrets.get('workos-session')).toContain('refresh_new');
    await service.signOut();
    expect(mocks.logoutUrl).toHaveBeenCalledWith({ sessionId: 'session_new' });
    expect(mocks.secrets.has('workos-session')).toBe(false);
  });
});

function token(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}
