import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainEnv } from './config/env';

const mocks = vi.hoisted(() => {
  const secrets = new Map<string, string>();
  return {
    secrets,
    openExternal: vi.fn(() => Promise.resolve()),
    authorization: vi.fn((options?: { redirectUri: string }) => {
      void options;
      return Promise.resolve({
        url: 'https://api.workos.com/user_management/authorize',
        state: 'state-abcdefghijklmnopqrstuvwxyz',
        codeVerifier: 'verifier-abcdefghijklmnopqrstuvwxyz',
      });
    }),
    authenticateCode: vi.fn(),
    refresh: vi.fn(),
    hostedMe: vi.fn(),
    hostedCheckout: vi.fn(),
    hostedPortal: vi.fn(),
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

vi.mock('./ai/hosted-client', () => {
  class CortexHostedResponseError extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
    ) {
      super(status === 401 ? 'Sign in to use Cortex AI.' : detail);
      this.name = 'CortexHostedResponseError';
    }
  }

  return {
    CortexHostedResponseError,
    CortexHostedClient: class {
      me() {
        return mocks.hostedMe() as unknown;
      }

      checkout(plan: 'creator' | 'pro', interval: 'month' | 'year') {
        return mocks.hostedCheckout(plan, interval) as unknown;
      }

      portal() {
        return mocks.hostedPortal() as unknown;
      }
    },
  };
});

import { CortexHostedResponseError } from './ai/hosted-client';
import { CortexAuthService } from './auth-service';

const USER = {
  id: 'user_01',
  email: 'jayson@example.com',
  firstName: 'Jayson',
  lastName: 'D',
  profilePictureUrl: null,
};
const GOOGLE_PROFILE_PICTURE = 'https://lh3.googleusercontent.com/a/cortex-test=s96-c';

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
    CORTEX_WORKOS_CALLBACK_MODE: 'protocol',
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
    mocks.hostedMe.mockResolvedValue({
      plan: 'free',
      billing: {
        interval: null,
        subscriptionStatus: 'none',
        cancelAtPeriodEnd: false,
        renewsAt: null,
        stripeCustomerPresent: false,
        paymentFailed: false,
      },
      ai: {
        entitled: false,
        enabled: false,
        usage: { percent: 0, state: 'used', resetsAt: null },
        limits: { concurrentRuns: 0 },
      },
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

  it('completes loopback PKCE through a self-closing browser page', async () => {
    const service = new CortexAuthService(env({ CORTEX_WORKOS_CALLBACK_MODE: 'loopback' }));
    await service.beginSignIn();

    const redirectUri = mocks.authorization.mock.calls.at(-1)?.[0]?.redirectUri;
    if (!redirectUri) throw new Error('The loopback redirect URI was not generated.');
    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    const response = await fetch(
      `${redirectUri}?code=code_01&state=state-abcdefghijklmnopqrstuvwxyz`,
    );
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('window.close()');
    expect((await service.status()).status).toBe('signed-in');
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

  it('keeps the Google profile picture from the WorkOS user in the signed-in identity', async () => {
    mocks.authenticateCode.mockResolvedValue({
      accessToken: token({ exp: 4_000_000_000, sid: 'session_01' }),
      refreshToken: 'refresh_01',
      user: { ...USER, profilePictureUrl: GOOGLE_PROFILE_PICTURE },
    });
    const service = new CortexAuthService(env());
    await service.beginSignIn();
    await service.handleCallback(
      'cortex-toolbox://auth/callback?code=code_01&state=state-abcdefghijklmnopqrstuvwxyz',
    );

    const status = await service.status();
    expect(status.identity?.avatarUrl).toBe(GOOGLE_PROFILE_PICTURE);
    expect(mocks.secrets.get('workos-session')).toContain(GOOGLE_PROFILE_PICTURE);
  });

  it('rotates an expired refresh token and signs out locally without opening a browser', async () => {
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
    expect(mocks.openExternal).not.toHaveBeenCalled();
    expect(mocks.secrets.has('workos-session')).toBe(false);
  });

  it('expires a saved session issued for a different WorkOS client', async () => {
    mocks.secrets.set(
      'workos-session',
      JSON.stringify({
        accessToken: token({ exp: 4_000_000_000, client_id: 'client_previous' }),
        refreshToken: 'refresh_previous',
        user: USER,
      }),
    );
    const service = new CortexAuthService(env());

    await expect(service.status()).resolves.toMatchObject({
      status: 'expired',
      message: 'This Cortex session belongs to a different build. Sign in again.',
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.secrets.has('workos-session')).toBe(false);
  });

  it('expires a locally valid session when Cortex Cloud rejects it', async () => {
    mocks.secrets.set(
      'workos-session',
      JSON.stringify({
        accessToken: token({ exp: 4_000_000_000, sid: 'session_01' }),
        refreshToken: 'refresh_01',
        user: USER,
      }),
    );
    mocks.hostedMe.mockRejectedValue(
      new CortexHostedResponseError(401, 'Your Cortex session expired. Sign in again.'),
    );
    const service = new CortexAuthService(
      env({ CORTEX_CLOUD_API_URL: 'https://cortex.example.test' }),
    );

    await expect(service.status()).resolves.toMatchObject({
      status: 'expired',
      identity: null,
      message: 'Cortex Cloud rejected this session. Sign in again.',
    });
    expect(mocks.secrets.has('workos-session')).toBe(false);
  });
});

function token(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify({ client_id: 'client_01', ...payload })).toString('base64url')}.signature`;
}
