import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthIdentity, Env } from './env';

const jwksByClient = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function authenticateRequest(request: Request, env: Env): Promise<AuthIdentity> {
  const authorization = request.headers.get('authorization');
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  if (!match?.[1]) throw new HttpError(401, 'Sign in to use Cortex Hosted.');
  if (!env.WORKOS_CLIENT_ID) throw new HttpError(503, 'Cortex authentication is not configured.');
  let jwks = jwksByClient.get(env.WORKOS_CLIENT_ID);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://api.workos.com/sso/jwks/${encodeURIComponent(env.WORKOS_CLIENT_ID)}`),
    );
    jwksByClient.set(env.WORKOS_CLIENT_ID, jwks);
  }
  try {
    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: env.WORKOS_ISSUER ?? 'https://api.workos.com/',
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new Error('Missing required WorkOS claims.');
    }
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    throw new HttpError(401, 'Your Cortex session expired. Sign in again.');
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
