import { expect, it, vi } from 'vitest';

vi.mock('node:crypto', () => {
  throw new Error('Browser entry loaded node:crypto');
});

it('loads the public entry without Node built-ins', async () => {
  await expect(import('./index')).resolves.toBeDefined();
});
