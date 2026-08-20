#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n", encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one exact match, found {count}")
    write(path, text.replace(old, new))


def replace_regex(path: str, pattern: str, replacement: str, *, flags: int = 0) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}")
    write(path, updated)


replace_once(
    "apps/cortex-cloud/src/auth.ts",
    """export function acceptedWorkOsIssuers(
  env: Pick<Env, 'WORKOS_CLIENT_ID' | 'WORKOS_ISSUER'>,
): string[] {
  const issuers = new Set([
    `https://api.workos.com/user_management/${encodeURIComponent(env.WORKOS_CLIENT_ID)}`,
  ]);
  const configuredIssuer = env.WORKOS_ISSUER.trim();
  if (configuredIssuer) issuers.add(configuredIssuer);
  return [...issuers];
}
""",
    """export function acceptedWorkOsIssuers(env: Pick<Env, 'WORKOS_ISSUER'>): string[] {
  const configuredIssuer = env.WORKOS_ISSUER.trim().replace(/\\/+$/, '');
  if (!configuredIssuer) return [];
  return [configuredIssuer, `${configuredIssuer}/`];
}
""",
)

write(
    "apps/cortex-cloud/src/auth.test.ts",
    r"""
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { acceptedWorkOsIssuers, verifyWorkOsAccessToken } from './auth';

const CLIENT_ID = 'client_current';
const ENV = {
  WORKOS_CLIENT_ID: CLIENT_ID,
  WORKOS_ISSUER: 'https://api.workos.com/',
};

describe('WorkOS access-token verification', () => {
  it('accepts the configured WorkOS issuer with or without a trailing slash', async () => {
    for (const issuer of ['https://api.workos.com', 'https://api.workos.com/']) {
      const { token, jwks } = await signedToken({ issuer, clientId: CLIENT_ID });
      await expect(verifyWorkOsAccessToken(token, ENV, jwks)).resolves.toEqual({
        userId: 'user_01',
        sessionId: 'session_01',
      });
    }
  });

  it('rejects the retired client-specific issuer shape', async () => {
    const { token, jwks } = await signedToken({
      issuer: `https://api.workos.com/user_management/${CLIENT_ID}`,
      clientId: CLIENT_ID,
    });

    await expect(verifyWorkOsAccessToken(token, ENV, jwks)).rejects.toThrow();
  });

  it('rejects a validly signed token issued to another WorkOS client', async () => {
    const { token, jwks } = await signedToken({
      issuer: 'https://api.workos.com',
      clientId: 'client_previous',
    });

    await expect(verifyWorkOsAccessToken(token, ENV, jwks)).rejects.toThrow(
      'Missing or invalid WorkOS claims.',
    );
  });

  it('normalizes an explicitly configured custom issuer', () => {
    expect(
      acceptedWorkOsIssuers({
        WORKOS_ISSUER: 'https://auth.cortex.example/',
      }),
    ).toEqual(['https://auth.cortex.example', 'https://auth.cortex.example/']);
  });
});

async function signedToken(input: { issuer: string; clientId: string }) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'workos-test-key';
  const jwks = createLocalJWKSet({ keys: [publicJwk] });
  const token = await new SignJWT({ sid: 'session_01', client_id: input.clientId })
    .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
    .setIssuer(input.issuer)
    .setSubject('user_01')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  return { token, jwks };
}
""",
)

replace_once(
    "apps/desktop/src/main/ai/hosted-client.ts",
    """interface HostedCompletionChoice {
  message?: { content?: string | null; tool_calls?: HostedToolCall[] };
}

export class CortexHostedClient {
""",
    """interface HostedCompletionChoice {
  message?: { content?: string | null; tool_calls?: HostedToolCall[] };
}

export class CortexHostedResponseError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(productErrorForHostedResponse(status, detail));
    this.name = 'CortexHostedResponseError';
  }
}

export class CortexHostedClient {
""",
)

replace_once(
    "apps/desktop/src/main/ai/hosted-client.ts",
    """      throw new Error(productErrorForHostedResponse(response.status, message));
""",
    """      throw new CortexHostedResponseError(response.status, message);
""",
)

write(
    "apps/desktop/src/main/ai/hosted-client.test.ts",
    r"""
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CortexHostedClient, CortexHostedResponseError } from './hosted-client';

describe('Cortex hosted response errors', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves a hosted 401 so account state can expire the rejected session', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Your Cortex session expired. Sign in again.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const request = new CortexHostedClient('https://cortex.example.test', 'token_01').me();

    await expect(request).rejects.toMatchObject({
      name: 'CortexHostedResponseError',
      status: 401,
      detail: 'Your Cortex session expired. Sign in again.',
      message: 'Sign in to use Cortex AI.',
    });
  });

  it('keeps provider configuration failures product-safe', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Cortex Cloud is not configured correctly.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      new CortexHostedClient('https://cortex.example.test', 'token_01').me(),
    ).rejects.toMatchObject({
      status: 503,
      message: 'Cortex Cloud is not configured correctly.',
    });
  });
});
""",
)

replace_once(
    "apps/desktop/src/main/auth-service.ts",
    """import { CortexHostedClient } from './ai/hosted-client';
""",
    """import { CortexHostedClient, CortexHostedResponseError } from './ai/hosted-client';
""",
)

replace_once(
    "apps/desktop/src/main/auth-service.ts",
    """    } catch {
      return {
        ...this.baseStatus('signed-in', identity),
        message: 'Cortex could not refresh plan and usage right now.',
      };
    }
""",
    """    } catch (error) {
      if (error instanceof CortexHostedResponseError && error.status === 401) {
        this.expireRejectedHostedSession();
        return this.baseStatus('expired', null);
      }
      return {
        ...this.baseStatus('signed-in', identity),
        message: 'Cortex could not refresh plan and usage right now.',
      };
    }
""",
)

replace_once(
    "apps/desktop/src/main/auth-service.ts",
    """  async checkout(plan: 'creator' | 'pro', interval: 'month' | 'year'): Promise<void> {
    const token = await this.accessToken();
    const url = await new CortexHostedClient(this.env.CORTEX_CLOUD_API_URL, token).checkout(
      plan,
      interval,
    );
    await shell.openExternal(url);
    this.scheduleBillingRefresh();
  }

  async portal(): Promise<void> {
    const token = await this.accessToken();
    const url = await new CortexHostedClient(this.env.CORTEX_CLOUD_API_URL, token).portal();
    await shell.openExternal(url);
    this.scheduleBillingRefresh();
  }
""",
    """  async checkout(plan: 'creator' | 'pro', interval: 'month' | 'year'): Promise<void> {
    const token = await this.accessToken();
    try {
      const url = await new CortexHostedClient(this.env.CORTEX_CLOUD_API_URL, token).checkout(
        plan,
        interval,
      );
      await shell.openExternal(url);
      this.scheduleBillingRefresh();
    } catch (error) {
      await this.handleHostedActionFailure(error);
      throw error;
    }
  }

  async portal(): Promise<void> {
    const token = await this.accessToken();
    try {
      const url = await new CortexHostedClient(this.env.CORTEX_CLOUD_API_URL, token).portal();
      await shell.openExternal(url);
      this.scheduleBillingRefresh();
    } catch (error) {
      await this.handleHostedActionFailure(error);
      throw error;
    }
  }
""",
)

replace_once(
    "apps/desktop/src/main/auth-service.ts",
    """  private async validSession(): Promise<StoredSession | null> {
""",
    """  private expireRejectedHostedSession(): void {
    secureSecrets.remove('workos-session');
    this.expired = true;
    this.notice = 'Cortex Cloud rejected this session. Sign in again.';
  }

  private async handleHostedActionFailure(error: unknown): Promise<void> {
    if (!(error instanceof CortexHostedResponseError) || error.status !== 401) return;
    this.expireRejectedHostedSession();
    await this.broadcast();
  }

  private async validSession(): Promise<StoredSession | null> {
""",
)

replace_once(
    "apps/desktop/src/main/auth-service.test.ts",
    """    authenticateCode: vi.fn(),
    refresh: vi.fn(),
""",
    """    authenticateCode: vi.fn(),
    refresh: vi.fn(),
    hostedMe: vi.fn(),
    hostedCheckout: vi.fn(),
    hostedPortal: vi.fn(),
""",
)

replace_once(
    "apps/desktop/src/main/auth-service.test.ts",
    """vi.mock('./ai/secure-storage', () => ({
  secureSecrets: {
    set: (name: string, value: string) => mocks.secrets.set(name, value),
    get: (name: string) => mocks.secrets.get(name) ?? null,
    has: (name: string) => mocks.secrets.has(name),
    remove: (name: string) => mocks.secrets.delete(name),
    encryptionAvailable: () => true,
  },
}));

import { CortexAuthService } from './auth-service';
""",
    """vi.mock('./ai/secure-storage', () => ({
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
        return mocks.hostedMe();
      }

      checkout(plan: 'creator' | 'pro', interval: 'month' | 'year') {
        return mocks.hostedCheckout(plan, interval);
      }

      portal() {
        return mocks.hostedPortal();
      }
    },
  };
});

import { CortexHostedResponseError } from './ai/hosted-client';
import { CortexAuthService } from './auth-service';
""",
)

replace_once(
    "apps/desktop/src/main/auth-service.test.ts",
    """    mocks.authenticateCode.mockResolvedValue({
      accessToken: token({ exp: 4_000_000_000, sid: 'session_01' }),
      refreshToken: 'refresh_01',
      user: USER,
    });
""",
    """    mocks.authenticateCode.mockResolvedValue({
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
""",
)

replace_once(
    "apps/desktop/src/main/auth-service.test.ts",
    """  it('expires a saved session issued for a different WorkOS client', async () => {
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
});
""",
    """  it('expires a saved session issued for a different WorkOS client', async () => {
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
""",
)

replace_once(
    "apps/cortex-cloud/src/runtime-config.ts",
    """const stripePriceId = z
  .string()
  .trim()
  .regex(/^price_[A-Za-z0-9]+$/);
""",
    """const stripePriceId = z
  .string()
  .trim()
  .regex(/^price_[A-Za-z0-9]+$/);
const stripePortalConfigurationId = z
  .string()
  .trim()
  .regex(/^bpc_[A-Za-z0-9]+$/);
""",
)

replace_once(
    "apps/cortex-cloud/src/runtime-config.ts",
    """export function requireBillingConfig(env: Env) {
  const prices = requirePriceConfig(env);
  return {
    secretKey: required('STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY, z.string().trim().min(1)),
    returnUrl: required('BILLING_RETURN_URL', env.BILLING_RETURN_URL, httpsUrl),
    prices,
  };
}
""",
    """export function requireStripeSecretKey(env: Env): string {
  return required('STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY, z.string().trim().min(1));
}

export function requireBillingConfig(env: Env) {
  const prices = requirePriceConfig(env);
  return {
    secretKey: requireStripeSecretKey(env),
    returnUrl: required('BILLING_RETURN_URL', env.BILLING_RETURN_URL, httpsUrl),
    portalConfigurationId: required(
      'STRIPE_PORTAL_CONFIGURATION_ID',
      env.STRIPE_PORTAL_CONFIGURATION_ID,
      stripePortalConfigurationId,
    ),
    prices,
  };
}
""",
)

write(
    "apps/cortex-cloud/src/runtime-config.test.ts",
    r"""
import { describe, expect, it } from 'vitest';
import {
  isFreeOnly,
  isHostedAiEnabled,
  requireAiProviderConfig,
  requireBillingConfig,
  runtimeConfigurationIssues,
} from './runtime-config';

const base = {
  CORTEX_FREE_ONLY: 'true',
  CORTEX_AI_ENABLED: 'false',
  AI_PROVIDER_ENABLED: 'false',
  WORKOS_CLIENT_ID: 'client_test',
  WORKOS_ISSUER: 'https://api.workos.com/',
} as never;

const billing = {
  STRIPE_CREATOR_MONTHLY_PRICE_ID: 'price_creator_month',
  STRIPE_CREATOR_ANNUAL_PRICE_ID: 'price_creator_year',
  STRIPE_PRO_MONTHLY_PRICE_ID: 'price_pro_month',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_pro_year',
  STRIPE_SECRET_KEY: 'sk_test_cortex',
  STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_cortex',
  BILLING_RETURN_URL: 'https://billing.example.test/account',
};

describe('Worker runtime configuration', () => {
  it('fails closed when commercial feature flags are absent', () => {
    expect(isFreeOnly({} as never)).toBe(true);
    expect(isHostedAiEnabled({} as never)).toBe(false);
  });

  it('does not require production credentials for free-only local development', () => {
    expect(runtimeConfigurationIssues(base)).toEqual([]);
  });

  it('requires a restricted Customer Portal before commercial billing can start', () => {
    expect(requireBillingConfig(billing as never)).toMatchObject({
      portalConfigurationId: 'bpc_cortex',
      returnUrl: 'https://billing.example.test/account',
    });
    expect(() =>
      requireBillingConfig({
        ...billing,
        STRIPE_PORTAL_CONFIGURATION_ID: '',
      } as never),
    ).toThrow('Missing or invalid required environment variable: STRIPE_PORTAL_CONFIGURATION_ID');
  });

  it('names missing variables without including values', () => {
    expect(() => requireAiProviderConfig({} as never)).toThrow(
      'Missing or invalid required environment variable: OPENROUTER_API_KEY',
    );
    expect(() => requireBillingConfig({} as never)).toThrow(
      'Missing or invalid required environment variable: STRIPE_CREATOR_MONTHLY_PRICE_ID',
    );
  });
});
""",
)

replace_once(
    "apps/cortex-cloud/src/deployment-config.ts",
    """  'STRIPE_PRO_MONTHLY_PRICE_ID',
  'STRIPE_PRO_ANNUAL_PRICE_ID',
  'BILLING_RETURN_URL',
""",
    """  'STRIPE_PRO_MONTHLY_PRICE_ID',
  'STRIPE_PRO_ANNUAL_PRICE_ID',
  'STRIPE_PORTAL_CONFIGURATION_ID',
  'BILLING_RETURN_URL',
""",
)

replace_once(
    "apps/cortex-cloud/src/deployment-config.ts",
    """  STRIPE_PORTAL_CONFIGURATION_ID: z.string().trim().default(''),
""",
    """  STRIPE_PORTAL_CONFIGURATION_ID: z
    .string()
    .trim()
    .regex(/^bpc_[A-Za-z0-9]+$/),
""",
)

replace_once(
    "apps/cortex-cloud/src/deployment-config.ts",
    """    'compatibility_date',
    'database_id',
    ...DEPLOYMENT_VARIABLES,
""",
    """    'compatibility_date',
    'database_id',
    'WORKOS_ISSUER',
    ...DEPLOYMENT_VARIABLES,
""",
)

replace_once(
    "apps/cortex-cloud/src/deployment-config.ts",
    """  if (values.get('CORTEX_FREE_ONLY') !== 'false') issues.push('CORTEX_FREE_ONLY must be false.');
  return [...new Set(issues)];
}
""",
    """  if (values.get('CORTEX_FREE_ONLY') !== 'false') issues.push('CORTEX_FREE_ONLY must be false.');
  if (!/^bpc_[A-Za-z0-9]+$/.test(values.get('STRIPE_PORTAL_CONFIGURATION_ID') ?? '')) {
    issues.push('STRIPE_PORTAL_CONFIGURATION_ID must be a Stripe bpc_ identifier.');
  }
  return [...new Set(issues)];
}
""",
)

write(
    "apps/cortex-cloud/src/deployment-config.test.ts",
    r"""
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createProductionConfig,
  validateProductionConfig,
  validatePublicConfig,
} from './deployment-config';

const publicConfig = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const productionEnvironment = {
  CLOUDFLARE_D1_DATABASE_ID: '10000000-0000-4000-8000-000000000000',
  WORKOS_CLIENT_ID: 'client_test',
  STRIPE_CREATOR_MONTHLY_PRICE_ID: 'price_cm',
  STRIPE_CREATOR_ANNUAL_PRICE_ID: 'price_ca',
  STRIPE_PRO_MONTHLY_PRICE_ID: 'price_pm',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_pa',
  STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_cortex',
  BILLING_RETURN_URL: 'https://billing.example.test/account',
  CORTEX_AI_ENABLED: 'true',
  AI_PROVIDER_ENABLED: 'true',
  CORTEX_FREE_ONLY: 'false',
} satisfies Record<string, string>;

describe('public and production Worker configuration', () => {
  it('keeps the checked-in profile free of deployment identifiers and fail-open defaults', () => {
    expect(validatePublicConfig(publicConfig)).toEqual([]);
  });

  it('generates an ignored production overlay from deployment environment values', () => {
    const generated = createProductionConfig(productionEnvironment);
    expect(validateProductionConfig(generated)).toEqual([]);
    expect(generated).toContain('database_id =');
    expect(generated).toContain('CORTEX_FREE_ONLY = "false"');
    expect(generated).toContain('STRIPE_PORTAL_CONFIGURATION_ID = "bpc_cortex"');
    expect(generated).not.toContain('OPENROUTER_API_KEY');
    expect(generated).not.toContain('STRIPE_SECRET_KEY');
    expect(generated).not.toContain('STRIPE_WEBHOOK_SECRET');
  });

  it('requires a restricted Stripe portal identifier for production', () => {
    expect(() =>
      createProductionConfig({
        ...productionEnvironment,
        STRIPE_PORTAL_CONFIGURATION_ID: '',
      }),
    ).toThrow('STRIPE_PORTAL_CONFIGURATION_ID');
  });

  it('names missing deployment variables without revealing any supplied value', () => {
    expect(() => createProductionConfig({})).toThrow(
      'Production deployment configuration is invalid or missing:',
    );
  });

  it('rejects deployment identifiers and secret names in the public profile', () => {
    const unsafe = publicConfig
      .replace('WORKOS_CLIENT_ID = ""', `WORKOS_CLIENT_ID = "client_${'x'.repeat(24)}"`)
      .replace('[vars]', '[vars]\nSTRIPE_SECRET_KEY = "test-only-value"');
    expect(validatePublicConfig(unsafe)).toEqual(
      expect.arrayContaining([
        'WORKOS_CLIENT_ID is deployment configuration and must be empty in public config.',
        'STRIPE_SECRET_KEY is a secret and must be stored with Wrangler secrets.',
      ]),
    );
  });
});
""",
)

replace_once(
    "apps/cortex-cloud/src/billing.ts",
    """import { requireBillingConfig, requirePriceConfig } from './runtime-config';
""",
    """import {
  requireBillingConfig,
  requirePriceConfig,
  requireStripeSecretKey,
} from './runtime-config';
""",
)

replace_once(
    "apps/cortex-cloud/src/billing.ts",
    """  const body = new URLSearchParams({ customer: customerId, return_url: billingConfig.returnUrl });
  if (env.STRIPE_PORTAL_CONFIGURATION_ID) {
    body.set('configuration', env.STRIPE_PORTAL_CONFIGURATION_ID);
  }
""",
    """  const body = new URLSearchParams({
    customer: customerId,
    return_url: billingConfig.returnUrl,
    configuration: billingConfig.portalConfigurationId,
  });
""",
)

replace_once(
    "apps/cortex-cloud/src/billing.ts",
    """  const { secretKey } = requireBillingConfig(env);
""",
    """  const secretKey = requireStripeSecretKey(env);
""",
)

replace_once(
    "apps/cortex-cloud/src/billing.test.ts",
    """import { describe, expect, it } from 'vitest';
import { policyForPrice, priceForSelection, pricePolicies, verifyStripeSignature } from './billing';
""",
    """import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPortal,
  policyForPrice,
  priceForSelection,
  pricePolicies,
  verifyStripeSignature,
} from './billing';
""",
)

replace_once(
    "apps/cortex-cloud/src/billing.test.ts",
    """const env = {
  STRIPE_CREATOR_MONTHLY_PRICE_ID: 'price_t1',
  STRIPE_CREATOR_ANNUAL_PRICE_ID: 'price_t2',
  STRIPE_PRO_MONTHLY_PRICE_ID: 'price_t3',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_t4',
} as Env;

describe('Stripe entitlement authority', () => {
""",
    """const env = {
  STRIPE_CREATOR_MONTHLY_PRICE_ID: 'price_t1',
  STRIPE_CREATOR_ANNUAL_PRICE_ID: 'price_t2',
  STRIPE_PRO_MONTHLY_PRICE_ID: 'price_t3',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_t4',
} as Env;

const billingEnv = {
  ...env,
  STRIPE_SECRET_KEY: 'sk_test_cortex',
  STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_cortex',
  BILLING_RETURN_URL: 'https://billing.example.test/account',
} as Env;

afterEach(() => vi.restoreAllMocks());

describe('Stripe entitlement authority', () => {
""",
)

replace_once(
    "apps/cortex-cloud/src/billing.test.ts",
    """  it('accepts a current valid webhook signature and rejects forged or stale signatures', async () => {
""",
    """  it('pins every Customer Portal session to the restricted configuration', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://billing.stripe.test/session' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(createPortal(billingEnv, 'cus_cortex')).resolves.toBe(
      'https://billing.stripe.test/session',
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(URLSearchParams);
    expect((request?.body as URLSearchParams).get('configuration')).toBe('bpc_cortex');
  });

  it('fails closed before calling Stripe when the restricted portal is missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      createPortal({ ...billingEnv, STRIPE_PORTAL_CONFIGURATION_ID: '' }, 'cus_cortex'),
    ).rejects.toThrow('STRIPE_PORTAL_CONFIGURATION_ID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a current valid webhook signature and rejects forged or stale signatures', async () => {
""",
)

write(
    "apps/cortex-cloud/scripts/setup-stripe.mjs",
    r"""
const PLANS = /** @type {const} */ (['creator', 'pro']);

/** @type {Array<{plan: 'creator' | 'pro', interval: 'month' | 'year', variable: string, expectedAmount: number}>} */
const PRICES = [
  {
    plan: 'creator',
    interval: 'month',
    variable: 'STRIPE_CREATOR_MONTHLY_PRICE_ID',
    expectedAmount: 799,
  },
  {
    plan: 'creator',
    interval: 'year',
    variable: 'STRIPE_CREATOR_ANNUAL_PRICE_ID',
    expectedAmount: 6999,
  },
  { plan: 'pro', interval: 'month', variable: 'STRIPE_PRO_MONTHLY_PRICE_ID', expectedAmount: 1499 },
  { plan: 'pro', interval: 'year', variable: 'STRIPE_PRO_ANNUAL_PRICE_ID', expectedAmount: 12999 },
];

const secret = required(
  process.env.STRIPE_SECRET_KEY,
  'Set STRIPE_SECRET_KEY in this owner shell before running setup.',
);
/** @type {Array<{plan: 'creator' | 'pro', interval: 'month' | 'year', id: string}>} */
const resolved = [];
/** @type {Map<'creator' | 'pro', string>} */
const products = new Map();

for (const policy of PRICES) {
  const id = required(process.env[policy.variable], `Set ${policy.variable}.`);
  const price = await stripe('GET', `/v1/prices/${encodeURIComponent(id)}`);
  const productValue = price.product;
  const productId =
    typeof productValue === 'string' ? productValue : recordString(productValue, 'id');
  const recurring = record(price.recurring);
  if (price.active !== true || !productId?.startsWith('prod_')) {
    throw new Error(`${id} is not an active recurring price on a Stripe product.`);
  }
  if (
    price.currency !== 'usd' ||
    price.unit_amount !== policy.expectedAmount ||
    recurring.interval !== policy.interval
  ) {
    throw new Error(
      `${id} does not match the approved ${policy.plan}/${policy.interval} amount and cadence.`,
    );
  }
  const existingProduct = products.get(policy.plan);
  if (existingProduct && existingProduct !== productId) {
    throw new Error(`The ${policy.plan} monthly and annual prices use different products.`);
  }
  products.set(policy.plan, productId);
  resolved.push({ plan: policy.plan, interval: policy.interval, id });
  console.log(`Verified configured ${policy.plan}/${policy.interval} price.`);
}

const creatorProduct = required(products.get('creator'), 'The Creator product could not be resolved.');
const proProduct = required(products.get('pro'), 'The Pro product could not be resolved.');
if (creatorProduct === proProduct) {
  throw new Error('Creator and Pro must use separate Stripe products.');
}

for (const plan of PLANS) {
  const productId = required(products.get(plan), `The ${plan} product could not be resolved.`);
  const product = await stripe('GET', `/v1/products/${encodeURIComponent(productId)}`);
  const metadata = record(product.metadata);
  if (
    product.active !== true ||
    recordString(metadata, 'app') !== 'cortex-toolbox' ||
    recordString(metadata, 'entitlement') !== 'cortex_ai' ||
    recordString(metadata, 'plan') !== plan
  ) {
    throw new Error(`${productId} is not the approved active Cortex AI ${plan} product.`);
  }
  console.log(`Verified configured ${plan} product metadata.`);
}

if (!process.argv.includes('--apply-portal')) {
  console.log(
    'Validation complete. Re-run with --apply-portal to explicitly create or update the restricted Customer Portal configuration.',
  );
  process.exit(0);
}

if (process.env.CORTEX_STRIPE_SETUP_CONFIRM !== 'I_UNDERSTAND_THIS_MUTATES_STRIPE') {
  throw new Error(
    'Set CORTEX_STRIPE_SETUP_CONFIRM=I_UNDERSTAND_THIS_MUTATES_STRIPE before --apply-portal.',
  );
}

const form = new URLSearchParams({
  'business_profile[headline]': 'Manage your Cortex AI subscription',
  'features[invoice_history][enabled]': 'true',
  'features[payment_method_update][enabled]': 'true',
  'features[subscription_cancel][enabled]': 'true',
  'features[subscription_cancel][mode]': 'at_period_end',
  'features[subscription_update][enabled]': 'true',
  'features[subscription_update][default_allowed_updates][0]': 'price',
});

for (const [index, plan] of PLANS.entries()) {
  const product = required(products.get(plan), `The ${plan} product could not be resolved.`);
  form.set(`features[subscription_update][products][${index}][product]`, product);
  resolved
    .filter((price) => price.plan === plan)
    .forEach((price, priceIndex) => {
      form.set(
        `features[subscription_update][products][${index}][prices][${priceIndex}]`,
        price.id,
      );
    });
}

const configurationId = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
if (configurationId && !/^bpc_[A-Za-z0-9]+$/.test(configurationId)) {
  throw new Error('STRIPE_PORTAL_CONFIGURATION_ID must be a Stripe bpc_ identifier.');
}
const configuration = await stripe(
  'POST',
  configurationId
    ? `/v1/billing_portal/configurations/${encodeURIComponent(configurationId)}`
    : '/v1/billing_portal/configurations',
  form,
);
console.log(
  `Portal configuration ready: ${requiredString(configuration.id, 'Stripe returned no portal configuration ID.')}`,
);
console.log('Set STRIPE_PORTAL_CONFIGURATION_ID to that ID in the Worker production variables.');

/**
 * @param {'GET' | 'POST'} method
 * @param {string} route
 * @param {URLSearchParams=} body
 * @returns {Promise<Record<string, unknown>>}
 */
async function stripe(method, route, body) {
  const response = await fetch(`https://api.stripe.com${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(body ? { body } : {}),
  });
  /** @type {unknown} */
  const value = await response.json();
  const payload = record(value);
  if (!response.ok) {
    const message = recordString(payload.error, 'message');
    throw new Error(message ?? `Stripe returned ${response.status}.`);
  }
  return payload;
}

/** @param {unknown} value */
function record(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
}

/** @param {unknown} value @param {string} key */
function recordString(value, key) {
  const candidate = record(value)[key];
  return typeof candidate === 'string' ? candidate : null;
}

/** @param {unknown} value @param {string} message */
function requiredString(value, message) {
  if (typeof value !== 'string' || !value) throw new Error(message);
  return value;
}

/** @template T @param {T | null | undefined} value @param {string} message @returns {T} */
function required(value, message) {
  if (value === null || value === undefined || value === '') throw new Error(message);
  return value;
}
""",
)

replace_once(
    ".github/workflows/deploy-cloud.yml",
    """      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with: { version: 10.33.0 }
      - uses: actions/setup-node@v4
""",
    """      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
        with: { version: 10.33.0 }
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
""",
)

replace_once(
    ".github/workflows/deploy-cloud.yml",
    """      - run: pnpm --filter @cortex/cloud run check:bindings
      - name: Verify required Cloudflare secrets exist
        shell: bash
        run: |
          pnpm --filter @cortex/cloud exec wrangler secret list --json > "$RUNNER_TEMP/cortex-secret-names.json"
""",
    """      - run: pnpm --filter @cortex/cloud run check:bindings
      - run: pnpm --filter @cortex/cloud run prepare:deploy-config
      - name: Verify required Cloudflare secrets exist
        shell: bash
        run: |
          pnpm --filter @cortex/cloud exec wrangler secret list --config .wrangler/deploy/wrangler.production.toml --json > "$RUNNER_TEMP/cortex-secret-names.json"
""",
)

write(
    "scripts/verify-hosted-release-coordinates.mjs",
    r"""
const clientId = (process.env.CORTEX_WORKOS_CLIENT_ID ?? '').trim();
if (!/^client_[A-Za-z0-9]+$/.test(clientId)) {
  throw new Error('CORTEX_WORKOS_CLIENT_ID is missing or invalid.');
}

const rawCloudUrl = (process.env.CORTEX_CLOUD_API_URL ?? '').trim();
let cloudUrl;
try {
  cloudUrl = new URL(rawCloudUrl);
} catch {
  throw new Error('CORTEX_CLOUD_API_URL is missing or invalid.');
}
if (
  cloudUrl.protocol !== 'https:' ||
  cloudUrl.username ||
  cloudUrl.password ||
  cloudUrl.pathname !== '/' ||
  cloudUrl.search ||
  cloudUrl.hash
) {
  throw new Error('CORTEX_CLOUD_API_URL must be an HTTPS origin without credentials or a path.');
}

console.log('Verified hosted desktop release coordinates.');
""",
)

replace_once(
    ".github/workflows/release.yml",
    """      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
""",
    """      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with: { node-version: 24, cache: pnpm }
      - name: Verify hosted release coordinates
        env:
          CORTEX_WORKOS_CLIENT_ID: ${{ vars.CORTEX_WORKOS_CLIENT_ID }}
          CORTEX_CLOUD_API_URL: ${{ vars.CORTEX_CLOUD_API_URL }}
        run: node scripts/verify-hosted-release-coordinates.mjs
      - run: pnpm install --frozen-lockfile
""",
)

replace_once(
    ".github/workflows/platform-build.yml",
    """      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
""",
    """      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with: { node-version: 24, cache: pnpm }
      - name: Verify hosted release coordinates
        run: node scripts/verify-hosted-release-coordinates.mjs
      - run: pnpm install --frozen-lockfile
""",
)

replace_once(
    "apps/cortex-cloud/DEPLOYMENT.md",
    """The optional `stripe:setup` script reads Product IDs and Price IDs from the owner environment. It does not contain a Cortex catalogue. Use test-mode objects during development and never run automated tests with a live Stripe credential.

Required owner-shell variables for catalogue validation are:

- `STRIPE_CREATOR_PRODUCT_ID`
- `STRIPE_PRO_PRODUCT_ID`
- the four Price ID variables listed above
- `STRIPE_SECRET_KEY`

Portal mutation additionally requires the explicit confirmation variable documented by the script. Store the resulting portal configuration ID as deployment configuration, not source.
""",
    """The optional `stripe:setup` script reads the four Price IDs from the owner environment, derives their Product IDs from Stripe, and verifies the active Cortex product metadata, amount, currency, and cadence. It does not contain a live Cortex catalogue. Use test-mode objects during development and never run automated tests with a live Stripe credential.

Required owner-shell variables for catalogue validation are:

- the four Price ID variables listed above
- `STRIPE_SECRET_KEY`

Portal mutation additionally requires the explicit confirmation variable documented by the script. Store the resulting `bpc_` portal configuration ID as deployment configuration, not source. Commercial configuration, Checkout, and Portal all fail closed until this restricted configuration is present.
""",
)

# Remove this one-shot automation from the resulting commit.
for relative in [
    ".github/workflows/agent-release-fix.yml",
    "scripts/agent-release-fix.py",
]:
    target = ROOT / relative
    if target.exists():
        target.unlink()

subprocess.run(["git", "diff", "--check"], cwd=ROOT, check=True)
print("Applied Cortex hosted auth, billing, and release hardening.")
