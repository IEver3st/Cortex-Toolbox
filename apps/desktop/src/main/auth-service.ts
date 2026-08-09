import { timingSafeEqual } from 'node:crypto';
import { BrowserWindow, shell } from 'electron';
import { createWorkOS, type User } from '@workos-inc/node';
import { z } from 'zod';
import { accountChangedEvent, type AccountStatus } from '../shared/contracts';
import type { MainEnv } from './config/env';
import { CortexHostedClient } from './ai/hosted-client';
import { secureSecrets } from './ai/secure-storage';

export const CORTEX_AUTH_PROTOCOL = 'cortex-toolbox';
export const CORTEX_AUTH_REDIRECT_URI = `${CORTEX_AUTH_PROTOCOL}://auth/callback`;
const PKCE_TTL_MS = 10 * 60 * 1_000;

const storedUserSchema = z
  .object({
    id: z.string().min(1),
    email: z.email(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    profilePictureUrl: z.url().nullable(),
  })
  .strict();
const storedSessionSchema = z
  .object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    user: storedUserSchema,
  })
  .strict();
type StoredSession = z.infer<typeof storedSessionSchema>;
const pendingPkceSchema = z
  .object({
    state: z.string().min(20),
    codeVerifier: z.string().min(20),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export class CortexAuthService {
  private readonly workos;
  private expired = false;
  private notice: string | null = null;

  constructor(private readonly env: MainEnv) {
    // The placeholder is never sent: every network entrypoint first calls
    // assertConfigured(). It keeps the public-client SDK inert in local builds.
    this.workos = createWorkOS({ clientId: env.CORTEX_WORKOS_CLIENT_ID || 'client_unconfigured' });
  }

  configured(): boolean {
    return Boolean(this.env.CORTEX_WORKOS_CLIENT_ID);
  }

  cloudConfigured(): boolean {
    return Boolean(this.env.CORTEX_CLOUD_API_URL);
  }

  async beginSignIn(): Promise<void> {
    this.assertConfigured();
    this.notice = null;
    const { url, state, codeVerifier } =
      await this.workos.userManagement.getAuthorizationUrlWithPKCE({
        provider: 'authkit',
        clientId: this.env.CORTEX_WORKOS_CLIENT_ID,
        redirectUri: CORTEX_AUTH_REDIRECT_URI,
      });
    secureSecrets.set(
      'workos-pkce',
      JSON.stringify({ state, codeVerifier, expiresAt: Date.now() + PKCE_TTL_MS }),
    );
    await shell.openExternal(url);
  }

  async handleCallback(rawUrl: string): Promise<void> {
    this.assertConfigured();
    const url = new URL(rawUrl);
    if (
      url.protocol !== `${CORTEX_AUTH_PROTOCOL}:` ||
      url.hostname !== 'auth' ||
      url.pathname !== '/callback'
    ) {
      throw new Error('Cortex received an invalid authentication callback.');
    }
    const oauthError = url.searchParams.get('error');
    if (oauthError) {
      throw new Error(url.searchParams.get('error_description') ?? oauthError);
    }
    const rawPkce = secureSecrets.get('workos-pkce');
    const pkce = pendingPkceSchema.parse(rawPkce ? JSON.parse(rawPkce) : null);
    secureSecrets.remove('workos-pkce');
    if (pkce.expiresAt < Date.now()) throw new Error('The sign-in request expired. Start again.');
    const state = url.searchParams.get('state');
    if (!state || !sameSecret(state, pkce.state)) {
      throw new Error('The sign-in response did not match this Cortex session.');
    }
    const code = url.searchParams.get('code');
    if (!code) throw new Error('WorkOS did not return an authorization code.');
    const response = await this.workos.userManagement.authenticateWithCode({
      clientId: this.env.CORTEX_WORKOS_CLIENT_ID,
      code,
      codeVerifier: pkce.codeVerifier,
    });
    this.saveSession(response.accessToken, response.refreshToken, response.user);
    this.expired = false;
    this.notice = null;
    await this.broadcast();
  }

  async accessToken(): Promise<string> {
    const session = await this.validSession();
    if (!session) throw new Error('Sign in to use Cortex Hosted.');
    return session.accessToken;
  }

  async status(): Promise<AccountStatus> {
    if (!this.configured()) return this.baseStatus('unconfigured', null);
    const session = await this.validSession();
    if (!session) return this.baseStatus(this.expired ? 'expired' : 'signed-out', null);
    const identity = identityFromSession(session);
    if (!this.cloudConfigured()) {
      return {
        ...this.baseStatus('signed-in', identity),
        message: 'Managed AI and billing are not configured in this build.',
      };
    }
    try {
      const hosted = await new CortexHostedClient(
        this.env.CORTEX_CLOUD_API_URL,
        session.accessToken,
      ).me();
      return {
        configured: true,
        cloudConfigured: true,
        status: 'signed-in',
        identity,
        plan: hosted.plan,
        usage: hosted.usage,
        billing: hosted.billing,
        message: null,
      };
    } catch {
      return {
        ...this.baseStatus('signed-in', identity),
        message: 'Cortex could not refresh plan and usage right now.',
      };
    }
  }

  async signOut(): Promise<void> {
    const session = this.readSession();
    secureSecrets.remove('workos-session');
    secureSecrets.remove('workos-pkce');
    this.expired = false;
    this.notice = null;
    if (session) {
      const sessionId = jwtStringClaim(session.accessToken, 'sid');
      if (sessionId) {
        await shell.openExternal(this.workos.userManagement.getLogoutUrl({ sessionId }));
      }
    }
    await this.broadcast();
  }

  async checkout(cadence: 'monthly' | 'annual'): Promise<void> {
    const token = await this.accessToken();
    const url = await new CortexHostedClient(this.env.CORTEX_CLOUD_API_URL, token).checkout(
      cadence,
    );
    await shell.openExternal(url);
  }

  async portal(): Promise<void> {
    const token = await this.accessToken();
    const url = await new CortexHostedClient(this.env.CORTEX_CLOUD_API_URL, token).portal();
    await shell.openExternal(url);
  }

  async broadcast(): Promise<void> {
    const status = await this.status();
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(accountChangedEvent, status);
    }
  }

  async reportFailure(message: string): Promise<void> {
    this.notice = message;
    await this.broadcast();
  }

  private async validSession(): Promise<StoredSession | null> {
    const session = this.readSession();
    if (!session) return null;
    const expiresAt = jwtNumberClaim(session.accessToken, 'exp');
    if (expiresAt !== null && Date.now() < expiresAt * 1_000 - 10_000) return session;
    try {
      const refreshed = await this.workos.userManagement.authenticateWithRefreshToken({
        clientId: this.env.CORTEX_WORKOS_CLIENT_ID,
        refreshToken: session.refreshToken,
      });
      this.saveSession(refreshed.accessToken, refreshed.refreshToken, refreshed.user);
      this.expired = false;
      return this.readSession();
    } catch (error) {
      if (!isTerminalRefreshError(error)) {
        throw new Error('Cortex could not refresh the account session. Try again shortly.', {
          cause: error,
        });
      }
      secureSecrets.remove('workos-session');
      this.expired = true;
      return null;
    }
  }

  private readSession(): StoredSession | null {
    const raw = secureSecrets.get('workos-session');
    if (!raw) return null;
    try {
      return storedSessionSchema.parse(JSON.parse(raw));
    } catch {
      secureSecrets.remove('workos-session');
      return null;
    }
  }

  private saveSession(accessToken: string, refreshToken: string, user: User): void {
    const firstName = typeof user.firstName === 'string' ? user.firstName : null;
    const lastName = typeof user.lastName === 'string' ? user.lastName : null;
    const profilePictureUrl =
      typeof user.profilePictureUrl === 'string' && user.profilePictureUrl
        ? user.profilePictureUrl
        : null;
    secureSecrets.set(
      'workos-session',
      JSON.stringify({
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, firstName, lastName, profilePictureUrl },
      } satisfies StoredSession),
    );
  }

  private baseStatus(
    status: AccountStatus['status'],
    identity: AccountStatus['identity'],
  ): AccountStatus {
    return {
      configured: this.configured(),
      cloudConfigured: this.cloudConfigured(),
      status,
      identity,
      plan: null,
      usage: null,
      billing: null,
      message: this.notice,
    };
  }

  private assertConfigured(): void {
    if (!this.configured()) throw new Error('WorkOS is not configured in this build.');
    if (!secureSecrets.encryptionAvailable()) {
      throw new Error('Secure session storage is not available on this device.');
    }
  }
}

function identityFromSession(session: StoredSession): NonNullable<AccountStatus['identity']> {
  const displayName = [session.user.firstName, session.user.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    id: session.user.id,
    email: session.user.email,
    displayName: displayName || session.user.email,
    avatarUrl: session.user.profilePictureUrl,
  };
}

function sameSecret(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const segment = token.split('.')[1];
    return segment
      ? (JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function jwtStringClaim(token: string, claim: string): string | null {
  const value = decodeJwt(token)?.[claim];
  return typeof value === 'string' ? value : null;
}

function jwtNumberClaim(token: string, claim: string): number | null {
  const value = decodeJwt(token)?.[claim];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isTerminalRefreshError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('error' in error)) return false;
  const code = (error as { error?: unknown }).error;
  return code === 'invalid_grant' || code === 'mfa_enrollment' || code === 'sso_required';
}
