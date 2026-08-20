import { timingSafeEqual } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { createWorkOS, type User } from '@workos-inc/node';
import { BrowserWindow, shell } from 'electron';
import { z } from 'zod';
import { accountChangedEvent, type AccountStatus } from '../shared/contracts';
import { CortexHostedClient, CortexHostedResponseError } from './ai/hosted-client';
import { secureSecrets } from './ai/secure-storage';
import type { MainEnv } from './config/env';

export const CORTEX_AUTH_PROTOCOL = 'cortex-toolbox';
export const CORTEX_AUTH_REDIRECT_URI = `${CORTEX_AUTH_PROTOCOL}://auth/callback`;
export const CORTEX_AUTH_LOOPBACK_PATH = '/auth/callback';
const CORTEX_AUTH_LOOPBACK_HOST = '127.0.0.1';
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
    redirectUri: z.url(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export class CortexAuthService {
  private readonly workos;
  private expired = false;
  private notice: string | null = null;
  private loopbackServer: Server | null = null;
  private loopbackRedirectUri: string | null = null;
  private loopbackTimer: NodeJS.Timeout | null = null;

  constructor(private readonly env: MainEnv) {
    // The placeholder is never sent: every network entrypoint first calls
    // assertConfigured(). It keeps the public-client SDK inert in local builds.
    this.workos = createWorkOS({ clientId: env.CORTEX_WORKOS_CLIENT_ID || 'client_t1' });
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
    const redirectUri =
      this.env.CORTEX_WORKOS_CALLBACK_MODE === 'loopback'
        ? await this.startLoopbackCallback()
        : CORTEX_AUTH_REDIRECT_URI;
    try {
      const { url, state, codeVerifier } =
        await this.workos.userManagement.getAuthorizationUrlWithPKCE({
          provider: 'authkit',
          clientId: this.env.CORTEX_WORKOS_CLIENT_ID,
          redirectUri,
        });
      secureSecrets.set(
        'workos-pkce',
        JSON.stringify({ state, codeVerifier, redirectUri, expiresAt: Date.now() + PKCE_TTL_MS }),
      );
      await shell.openExternal(url);
    } catch (error) {
      this.stopLoopbackCallback();
      throw error;
    }
  }

  async handleCallback(rawUrl: string): Promise<void> {
    this.assertConfigured();
    const url = new URL(rawUrl);
    const oauthError = url.searchParams.get('error');
    if (oauthError) {
      throw new Error(url.searchParams.get('error_description') ?? oauthError);
    }
    const rawPkce = secureSecrets.get('workos-pkce');
    const pkce = pendingPkceSchema.parse(rawPkce ? JSON.parse(rawPkce) : null);
    secureSecrets.remove('workos-pkce');
    const expectedCallback = new URL(pkce.redirectUri);
    if (
      url.protocol !== expectedCallback.protocol ||
      url.host !== expectedCallback.host ||
      url.pathname !== expectedCallback.pathname
    ) {
      throw new Error('Cortex received an invalid authentication callback.');
    }
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
    if (!session) throw new Error('Sign in to use Cortex AI.');
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
        billing: hosted.billing,
        ai: hosted.ai,
        message: null,
      };
    } catch (error) {
      if (isHostedSessionRejection(error)) {
        this.expireSession(error.message);
        return this.baseStatus('expired', null);
      }
      return {
        ...this.baseStatus('signed-in', identity),
        message: 'Cortex could not refresh plan and usage right now.',
      };
    }
  }

  async signOut(): Promise<void> {
    this.stopLoopbackCallback();
    secureSecrets.remove('workos-session');
    secureSecrets.remove('workos-pkce');
    this.expired = false;
    this.notice = null;
    await this.broadcast();
  }

  async checkout(plan: 'creator' | 'pro', interval: 'month' | 'year'): Promise<void> {
    const url = await this.withHostedClient((client) => client.checkout(plan, interval));
    await shell.openExternal(url);
    this.scheduleBillingRefresh();
  }

  async portal(): Promise<void> {
    const url = await this.withHostedClient((client) => client.portal());
    await shell.openExternal(url);
    this.scheduleBillingRefresh();
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

  private async withHostedClient<T>(
    operation: (client: CortexHostedClient) => Promise<T>,
  ): Promise<T> {
    const token = await this.accessToken();
    try {
      return await operation(new CortexHostedClient(this.env.CORTEX_CLOUD_API_URL, token));
    } catch (error) {
      if (isHostedSessionRejection(error)) {
        this.expireSession(error.message);
        await this.broadcast();
      }
      throw error;
    }
  }

  private async validSession(): Promise<StoredSession | null> {
    const session = this.readSession();
    if (!session) return null;
    if (jwtStringClaim(session.accessToken, 'client_id') !== this.env.CORTEX_WORKOS_CLIENT_ID) {
      this.expireSession('This Cortex session belongs to a different build. Sign in again.');
      return null;
    }
    const expiresAt = jwtNumberClaim(session.accessToken, 'exp');
    if (expiresAt !== null && Date.now() < expiresAt * 1_000 - 10_000) return session;
    try {
      const refreshed = await this.workos.userManagement.authenticateWithRefreshToken({
        clientId: this.env.CORTEX_WORKOS_CLIENT_ID,
        refreshToken: session.refreshToken,
      });
      this.saveSession(refreshed.accessToken, refreshed.refreshToken, refreshed.user);
      this.expired = false;
      this.notice = null;
      return this.readSession();
    } catch (error) {
      if (!isTerminalRefreshError(error)) {
        throw new Error('Cortex could not refresh the account session. Try again shortly.', {
          cause: error,
        });
      }
      this.expireSession('Your Cortex session expired. Sign in again.');
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

  private expireSession(message: string): void {
    secureSecrets.remove('workos-session');
    this.expired = true;
    this.notice = message;
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
      billing: null,
      ai: null,
      message: this.notice,
    };
  }

  private assertConfigured(): void {
    if (!this.configured()) throw new Error('WorkOS is not configured in this build.');
    if (!secureSecrets.encryptionAvailable()) {
      throw new Error('Secure session storage is not available on this device.');
    }
  }

  private scheduleBillingRefresh(): void {
    for (const delay of [2_000, 5_000, 10_000]) {
      const timer = setTimeout(() => void this.broadcast(), delay);
      timer.unref();
    }
  }

  private async startLoopbackCallback(): Promise<string> {
    this.stopLoopbackCallback();
    const server = createServer((request, response) => {
      void this.handleLoopbackCallback(request.url ?? '/', response);
    });
    const redirectUri = await new Promise<string>((resolve, reject) => {
      const rejectOnError = (error: Error) => reject(error);
      server.once('error', rejectOnError);
      server.listen(0, CORTEX_AUTH_LOOPBACK_HOST, () => {
        server.off('error', rejectOnError);
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Cortex could not start its local sign-in callback.'));
          return;
        }
        resolve(`http://${CORTEX_AUTH_LOOPBACK_HOST}:${address.port}${CORTEX_AUTH_LOOPBACK_PATH}`);
      });
    });
    this.loopbackServer = server;
    this.loopbackRedirectUri = redirectUri;
    this.loopbackTimer = setTimeout(() => this.stopLoopbackCallback(), PKCE_TTL_MS);
    this.loopbackTimer.unref();
    return redirectUri;
  }

  private async handleLoopbackCallback(
    requestUrl: string,
    response: ServerResponse,
  ): Promise<void> {
    const redirectUri = this.loopbackRedirectUri;
    if (!redirectUri) {
      writeLoopbackPage(response, false);
      return;
    }
    const callback = new URL(requestUrl, redirectUri);
    if (
      callback.pathname !== CORTEX_AUTH_LOOPBACK_PATH ||
      callback.origin !== new URL(redirectUri).origin
    ) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    try {
      await this.handleCallback(callback.toString());
      writeLoopbackPage(response, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cortex sign-in failed.';
      await this.reportFailure(message);
      writeLoopbackPage(response, false);
    } finally {
      this.stopLoopbackCallback();
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed()) continue;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      }
    }
  }

  private stopLoopbackCallback(): void {
    if (this.loopbackTimer) clearTimeout(this.loopbackTimer);
    this.loopbackTimer = null;
    this.loopbackRedirectUri = null;
    this.loopbackServer?.close();
    this.loopbackServer = null;
  }
}

function writeLoopbackPage(response: ServerResponse, success: boolean): void {
  response.writeHead(success ? 200 : 400, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  const title = success ? 'Signed in to Cortex' : 'Cortex sign-in could not finish';
  const detail = success
    ? 'You can return to Cortex. This tab should close automatically.'
    : 'Return to Cortex and try signing in again.';
  response.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#232a2e;color:#d8d3ba;font:15px/1.55 system-ui,sans-serif}.panel{width:min(420px,calc(100vw - 48px));border:1px solid #465258;padding:28px;background:#2d363b}.mark{color:#a7c080;font-weight:700;letter-spacing:.02em}h1{margin:10px 0 8px;font-size:22px}p{margin:0;color:#9da9a0}button{margin-top:20px;border:1px solid #58666c;background:#374247;color:#d8d3ba;padding:9px 14px;font:inherit;cursor:pointer}</style></head>
<body><main class="panel"><div class="mark">Cortex ToolBox</div><h1>${title}</h1><p>${detail}</p><button type="button" onclick="window.close()">Close this tab</button></main>${success ? '<script>window.close()</script>' : ''}</body></html>`);
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

function jwtNumberClaim(token: string, claim: string): number | null {
  const value = decodeJwt(token)?.[claim];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function jwtStringClaim(token: string, claim: string): string | null {
  const value = decodeJwt(token)?.[claim];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isHostedSessionRejection(error: unknown): error is CortexHostedResponseError {
  return error instanceof CortexHostedResponseError && error.status === 401;
}

function isTerminalRefreshError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('error' in error)) return false;
  const code = (error as { error?: unknown }).error;
  return code === 'invalid_grant' || code === 'mfa_enrollment' || code === 'sso_required';
}
