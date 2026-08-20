import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthIdentity, Env } from './env';
import { requireWorkOsConfig } from './runtime-config';

const jwksByClient = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function authenticateRequest(request: Request, env: Env): Promise<AuthIdentity> {
  const authorization = request.headers.get('authorization');
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  if (!match?.[1]) throw new HttpError(401, 'Sign in to use Cortex Hosted.');
  const config = requireWorkOsConfig(env);
  let jwks = jwksByClient.get(config.clientId);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://api.workos.com/sso/jwks/${encodeURIComponent(config.clientId)}`),
    );
    jwksByClient.set(config.clientId, jwks);
  }
  try {
    return await verifyWorkOsAccessToken(match[1], env, jwks);
  } catch {
    throw new HttpError(401, 'Your Cortex session expired. Sign in again.');
  }
}

export async function verifyWorkOsAccessToken(
  accessToken: string,
  env: Pick<Env, 'WORKOS_CLIENT_ID' | 'WORKOS_ISSUER'>,
  jwks: JWTVerifyGetKey,
): Promise<AuthIdentity> {
  const { payload } = await jwtVerify(accessToken, jwks, {
    algorithms: ['RS256'],
    issuer: acceptedWorkOsIssuers(env),
  });
  if (
    payload.client_id !== env.WORKOS_CLIENT_ID ||
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string'
  ) {
    throw new Error('Missing or invalid WorkOS claims.');
  }
  return { userId: payload.sub, sessionId: payload.sid };
}

export function acceptedWorkOsIssuers(env: Pick<Env, 'WORKOS_ISSUER'>): string[] {
  const configuredIssuer = env.WORKOS_ISSUER.trim();
  if (!configuredIssuer) return [];
  const normalizedIssuer = configuredIssuer.replace(/\/+$/, '');
  return [normalizedIssuer, `${normalizedIssuer}/`];
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
