import { afterEach, describe, expect, it, vi } from 'vitest';
import { CortexHostedClient } from './hosted-client';

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
