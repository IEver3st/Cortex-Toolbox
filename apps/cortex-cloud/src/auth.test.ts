import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { acceptedWorkOsIssuers, verifyWorkOsAccessToken } from './auth';

const CLIENT_ID = 'client_current';
const ENV = {
  WORKOS_CLIENT_ID: CLIENT_ID,
  WORKOS_ISSUER: 'https://api.workos.com/',
};

describe('WorkOS access-token verification', () => {
  it('accepts the client-specific WorkOS issuer and pins the client claim', async () => {
    const { token, jwks } = await signedToken({
      issuer: `https://api.workos.com/user_management/${CLIENT_ID}`,
      clientId: CLIENT_ID,
    });

    await expect(verifyWorkOsAccessToken(token, ENV, jwks)).resolves.toEqual({
      userId: 'user_01',
      sessionId: 'session_01',
    });
  });

  it('rejects a validly signed token issued to another WorkOS client', async () => {
    const { token, jwks } = await signedToken({
      issuer: `https://api.workos.com/user_management/${CLIENT_ID}`,
      clientId: 'client_previous',
    });

    await expect(verifyWorkOsAccessToken(token, ENV, jwks)).rejects.toThrow(
      'Missing or invalid WorkOS claims.',
    );
  });

  it('keeps an explicitly configured custom issuer in the allowlist', () => {
    expect(
      acceptedWorkOsIssuers({
        WORKOS_CLIENT_ID: CLIENT_ID,
        WORKOS_ISSUER: 'https://auth.cortex.example',
      }),
    ).toEqual([
      `https://api.workos.com/user_management/${CLIENT_ID}`,
      'https://auth.cortex.example',
    ]);
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
