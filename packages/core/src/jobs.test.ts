import { describe, expect, it } from 'vitest';
import { JobQueue } from './jobs';

describe('job queue', () => {
  it('cancels cooperative work without fake completion', async () => {
    const queue = new JobQueue();
    const job = queue.enqueue(
      'test',
      'Cancelable fixture',
      async ({ signal }) =>
        new Promise<string[]>((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('cancelled', 'AbortError')),
            { once: true },
          );
          setTimeout(() => resolve([]), 1_000);
        }),
    );
    expect(queue.cancel(job.id)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queue.list()[0]?.status).toBe('cancelled');
  });
});
